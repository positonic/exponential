import { parseFirefliesSummary } from "~/lib/fireflies-summary";

/**
 * Pure-function view model for a Meeting card on the listing page.
 *
 * Inputs are the relevant fields of a `TranscriptionSession` plus its
 * `TranscriptionSessionParticipant` rows (the calendar invite, authoritative
 * source for "who attended"). Output drives the rendered card.
 *
 * No React, no Prisma, no tRPC. Safe to unit test in isolation.
 */

export interface MeetingCardSession {
  id: string;
  title: string | null;
  sessionId: string;
  summary: string | null;
  transcription: string | null;
  project: { id: string; name: string } | null;
  actions: Array<{ id: string }>;
}

export interface MeetingCardParticipant {
  id: string;
  email: string;
  name: string | null;
  user: { id: string; name: string | null; image: string | null } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
}

export interface MeetingCardAvatar {
  key: string;
  displayName: string;
  initials: string;
  colorClass: string;
  image: string | null;
}

export interface MeetingCardPeekLine {
  time: string;
  speaker: string;
  text: string;
}

export interface MeetingCardViewModel {
  title: string;
  projectPill: { id: string; name: string } | null;
  avatars: MeetingCardAvatar[];
  attendeeCount: number;
  highlight: string | null;
  actionCount: number;
  peekLines: MeetingCardPeekLine[] | null;
}

// Tailwind palette for participant avatars. Stable assignment by hash means
// the same Participant gets the same colour across renders without storing
// the choice anywhere.
const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
] as const;

function pickAvatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function computeInitials(displayName: string, fallbackEmail: string): string {
  const cleaned = displayName.trim();
  if (cleaned) {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]?.[0] ?? "";
      const b = parts[1]?.[0] ?? "";
      const out = `${a}${b}`.toUpperCase();
      if (out) return out;
    }
    if (parts.length === 1 && parts[0]) {
      const out = parts[0].slice(0, 2).toUpperCase();
      if (out) return out;
    }
  }
  const local = emailLocalPart(fallbackEmail);
  if (local) return local.slice(0, 2).toUpperCase();
  return "?";
}

function participantDisplayName(p: MeetingCardParticipant): string {
  const contactName = p.contact
    ? `${p.contact.firstName ?? ""} ${p.contact.lastName ?? ""}`.trim()
    : "";
  const candidates = [p.user?.name, contactName, p.name];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return emailLocalPart(p.email);
}

function participantStableKey(p: MeetingCardParticipant): string {
  if (p.user?.id) return `u:${p.user.id}`;
  if (p.contact?.id) return `c:${p.contact.id}`;
  return `e:${p.email.toLowerCase()}`;
}

function buildAvatar(p: MeetingCardParticipant): MeetingCardAvatar {
  const displayName = participantDisplayName(p);
  const key = participantStableKey(p);
  return {
    key,
    displayName,
    initials: computeInitials(displayName, p.email),
    colorClass: pickAvatarColor(key),
    image: p.user?.image ?? null,
  };
}

function computeHighlight(summary: string | null): string | null {
  const parsed = parseFirefliesSummary(summary);
  if (!parsed) return null;
  const overview = parsed.overview?.trim();
  if (overview) return overview;
  const bullet = parsed.shorthand_bullet?.find(
    (b) => typeof b === "string" && b.trim().length > 0,
  );
  if (bullet) return bullet.trim();
  return null;
}

function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(safe / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

interface TranscriptionSentence {
  start_time?: number;
  speaker_name?: string | null;
  text?: string;
}

function computePeekLines(transcription: string | null): MeetingCardPeekLine[] | null {
  if (!transcription) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(transcription);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("sentences" in parsed)) {
    return null;
  }
  const sentences = (parsed as { sentences?: TranscriptionSentence[] }).sentences;
  if (!sentences?.length) return null;
  const lines = sentences.slice(0, 2).map((s) => ({
    time: formatTimestamp(s.start_time ?? 0),
    speaker: s.speaker_name ?? "Unknown",
    text: s.text ?? "",
  }));
  return lines.length > 0 ? lines : null;
}

/**
 * Build the view model that drives a Meeting card on the listing page.
 *
 * - `title` falls back to `Meeting ${sessionId}` when no title is set.
 * - `highlight` resolves Fireflies `overview` → `shorthand_bullet[0]` → null.
 * - `avatars` are derived from authoritative Participants (calendar invite),
 *   not transcript speakers. Display name resolves linked User → linked
 *   CrmContact → Participant `name` → email local part.
 * - `attendeeCount` is `participants.length` (silent attendees count).
 * - `actionCount` is `session.actions.length` — including zero.
 * - `peekLines` returns the first two transcript sentences as a parsed
 *   preview, or null when the transcript JSON is missing/invalid.
 */
export function buildMeetingCardViewModel(
  session: MeetingCardSession,
  participants: MeetingCardParticipant[],
): MeetingCardViewModel {
  const title = session.title ?? `Meeting ${session.sessionId}`;
  const projectPill = session.project
    ? { id: session.project.id, name: session.project.name }
    : null;
  const avatars = participants.map(buildAvatar);
  return {
    title,
    projectPill,
    avatars,
    attendeeCount: participants.length,
    highlight: computeHighlight(session.summary),
    actionCount: session.actions.length,
    peekLines: computePeekLines(session.transcription),
  };
}
