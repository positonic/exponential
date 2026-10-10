/**
 * iCalendar invite builder (RFC 5545) — the ONLY write path from Exponential
 * to attendees' real calendars. Hand-rolled deliberately: METHOD:REQUEST /
 * METHOD:CANCEL against a stable UID with a monotonic SEQUENCE is a small,
 * fully-specified surface, and Outlook/Gmail render it natively with
 * Accept/Decline — no provider API write-back needed.
 *
 * Pure: text in, text out. Golden-file tested.
 */

export interface InviteParticipant {
  name: string | null;
  email: string;
}

export interface BuildInviteInput {
  method: "REQUEST" | "CANCEL";
  uid: string;
  /** Monotonic per meeting; bump on every outbound change, cancel included. */
  sequence: number;
  organizer: InviteParticipant;
  attendees: InviteParticipant[];
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  /** DTSTAMP — injectable for deterministic tests. */
  now?: Date;
}

/** TEXT value escaping per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC date-time: 20260816T140000Z. */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Fold a content line at 75 octets (RFC 5545 §3.1): continuation lines start
 * with a single space. Folds on UTF-8 byte length, never splitting a
 * multi-byte character.
 */
function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return [line];

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line gets 75 octets, continuations 74 (the leading space costs one).
  let budget = 75;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > budget) {
      out.push(current);
      current = " ";
      currentBytes = 1;
      budget = 75;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current.length > 0) out.push(current);
  return out;
}

function participantLine(
  property: "ORGANIZER" | "ATTENDEE",
  participant: InviteParticipant,
  params: string[] = [],
): string {
  const cn = participant.name ? [`CN=${escapeText(participant.name)}`] : [];
  const allParams = [...cn, ...params].map((p) => `;${p}`).join("");
  return `${property}${allParams}:mailto:${participant.email}`;
}

export function buildInviteIcs(input: BuildInviteInput): string {
  const {
    method,
    uid,
    sequence,
    organizer,
    attendees,
    title,
    description,
    location,
    startsAt,
    endsAt,
  } = input;
  const now = input.now ?? new Date();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Exponential//Workspace Scheduling//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(startsAt)}`,
    `DTEND:${utcStamp(endsAt)}`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:${escapeText(title)}`,
    method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    participantLine("ORGANIZER", organizer),
    ...attendees.map((attendee) =>
      participantLine("ATTENDEE", attendee, [
        "ROLE=REQ-PARTICIPANT",
        "PARTSTAT=NEEDS-ACTION",
        "RSVP=TRUE",
      ]),
    ),
  ];

  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}
