/**
 * Unit tests for normalizeProviderEvent — the pure mapping from a provider
 * service's CalendarEvent payload to a persistable row. The interesting part
 * is instant parsing: Google emits RFC 3339 with an offset, Microsoft Graph
 * emits local-time strings with NO offset plus a separate timeZone.
 */

import { describe, it, expect } from "vitest";

import { normalizeProviderEvent } from "../CalendarSyncService";

const base = {
  id: "evt-1",
  summary: "Busy block",
  htmlLink: "",
  status: "confirmed",
};

describe("normalizeProviderEvent", () => {
  it("parses a Microsoft-style UTC string without offset as UTC", () => {
    const row = normalizeProviderEvent({
      ...base,
      start: { dateTime: "2026-08-18T09:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-08-18T10:00:00.0000000", timeZone: "UTC" },
    });

    expect(row!.startsAt.toISOString()).toBe("2026-08-18T09:00:00.000Z");
    expect(row!.endsAt.toISOString()).toBe("2026-08-18T10:00:00.000Z");
    expect(row!.isAllDay).toBe(false);
  });

  it("parses a Google-style RFC 3339 string with offset", () => {
    const row = normalizeProviderEvent({
      ...base,
      start: { dateTime: "2026-08-18T11:00:00+02:00" },
      end: { dateTime: "2026-08-18T12:00:00+02:00" },
    });

    expect(row!.startsAt.toISOString()).toBe("2026-08-18T09:00:00.000Z");
    expect(row!.endsAt.toISOString()).toBe("2026-08-18T10:00:00.000Z");
  });

  it("anchors all-day dates to UTC midnight", () => {
    const row = normalizeProviderEvent({
      ...base,
      start: { date: "2026-08-20" },
      end: { date: "2026-08-21" },
    });

    expect(row!.isAllDay).toBe(true);
    expect(row!.startsAt.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(row!.endsAt.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });

  it("skips cancelled events", () => {
    expect(
      normalizeProviderEvent({
        ...base,
        status: "cancelled",
        start: { dateTime: "2026-08-18T09:00:00Z" },
        end: { dateTime: "2026-08-18T10:00:00Z" },
      }),
    ).toBeNull();
  });

  it("skips events with an unparseable start", () => {
    expect(
      normalizeProviderEvent({
        ...base,
        start: { dateTime: "not a date", timeZone: "Pacific/Fiji" },
        end: { dateTime: "2026-08-18T10:00:00Z" },
      }),
    ).toBeNull();
  });

  it("defaults a missing end to the start instant", () => {
    const row = normalizeProviderEvent({
      ...base,
      start: { dateTime: "2026-08-18T09:00:00Z" },
      end: {},
    });

    expect(row!.endsAt.getTime()).toBe(row!.startsAt.getTime());
  });
});
