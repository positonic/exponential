/**
 * Golden-file tests for the iCalendar invite builder. The exact byte output
 * matters: Outlook and Gmail's native Accept/Decline rendering depends on a
 * well-formed METHOD + UID + SEQUENCE, and folding/escaping bugs surface as
 * silently broken invites.
 */

import { describe, it, expect } from "vitest";

import { buildInviteIcs } from "../inviteIcs";

const NOW = new Date("2026-08-16T12:00:00Z");

const baseInput = {
  uid: "meeting-abc123@exponential.im",
  sequence: 0,
  organizer: { name: "James Farrell", email: "james@example.com" },
  attendees: [
    { name: "Andi Stanner", email: "andi@example.com" },
    { name: null, email: "noname@example.com" },
  ],
  title: "Design sync",
  startsAt: new Date("2026-08-18T09:00:00Z"),
  endsAt: new Date("2026-08-18T10:00:00Z"),
  now: NOW,
} as const;

describe("buildInviteIcs", () => {
  it("produces the golden METHOD:REQUEST invite", () => {
    const ics = buildInviteIcs({ ...baseInput, method: "REQUEST" });

    expect(ics).toBe(
      [
        "BEGIN:VCALENDAR",
        "PRODID:-//Exponential//Workspace Scheduling//EN",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        "UID:meeting-abc123@exponential.im",
        "DTSTAMP:20260816T120000Z",
        "DTSTART:20260818T090000Z",
        "DTEND:20260818T100000Z",
        "SEQUENCE:0",
        "SUMMARY:Design sync",
        "STATUS:CONFIRMED",
        "ORGANIZER;CN=James Farrell:mailto:james@example.com",
        "ATTENDEE;CN=Andi Stanner;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TR",
        " UE:mailto:andi@example.com",
        "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:noname",
        " @example.com",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });

  it("produces the golden METHOD:CANCEL against the same UID with a bumped sequence", () => {
    const ics = buildInviteIcs({ ...baseInput, method: "CANCEL", sequence: 1 });

    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("UID:meeting-abc123@exponential.im");
    expect(ics).not.toContain("STATUS:CONFIRMED");
  });

  it("escapes commas, semicolons, backslashes, and newlines in text values", () => {
    const ics = buildInviteIcs({
      ...baseInput,
      method: "REQUEST",
      title: "Planning; Q3, part 1",
      description: "Line one\nLine two\\end",
      location: "Room 1; Building A",
    });

    expect(ics).toContain("SUMMARY:Planning\\; Q3\\, part 1");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\\\\end");
    expect(ics).toContain("LOCATION:Room 1\\; Building A");
  });

  it("folds every line to at most 75 octets, unfolding losslessly", () => {
    const ics = buildInviteIcs({
      ...baseInput,
      method: "REQUEST",
      description: "long ".repeat(60) + "end",
    });

    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfolding (CRLF + space removal) restores the full description.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DESCRIPTION:" + ("long ".repeat(60) + "end").replace(/\n/g, "\\n"));
  });

  it("folds on byte length, never splitting a multi-byte character", () => {
    const ics = buildInviteIcs({
      ...baseInput,
      method: "REQUEST",
      description: "ü".repeat(200),
    });

    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("ü".repeat(200));
  });
});
