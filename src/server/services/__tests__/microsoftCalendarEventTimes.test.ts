/**
 * Event times coming out of MicrosoftCalendarService. Graph answers
 * calendarView (and the event POST) with offset-less strings such as
 * "2026-10-05T14:00:00.0000000" next to a `timeZone` of "UTC" — we send no
 * `Prefer: outlook.timezone`, so UTC is what it uses. Every consumer parses
 * `CalendarEvent.start.dateTime` with parseISO / `new Date`, which read an
 * offset-less string as LOCAL time, so the service has to hand back an
 * explicit instant or the event renders shifted by the viewer's UTC offset.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { format, parseISO } from "date-fns";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("~/server/db", () => ({
  db: { connectedAccount: { findFirst, update: vi.fn() } },
}));

import { MicrosoftCalendarService } from "../MicrosoftCalendarService";
import { normalizeProviderEvent } from "../calendar/CalendarSyncService";

const userId = "user-1";

/** A 16:00–17:00 CEST meeting, as Graph returns it: 14:00–15:00 UTC. */
const graphEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  subject: "Planning",
  start: { dateTime: "2026-10-05T14:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2026-10-05T15:00:00.0000000", timeZone: "UTC" },
  webLink: "https://outlook.office365.com/owa/?itemid=evt-1",
  showAs: "busy",
  isCancelled: false,
  isAllDay: false,
  ...overrides,
});

const range = {
  timeMin: new Date("2026-10-05T00:00:00Z"),
  timeMax: new Date("2026-10-06T00:00:00Z"),
  // The cache is module-level and keyed on the window, which every test shares.
  useCache: false,
};

describe("MicrosoftCalendarService event times", () => {
  let service: MicrosoftCalendarService;
  const fetchMock = vi.fn();

  const respondWith = (body: unknown, status = 200) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    service = new MicrosoftCalendarService();
    findFirst.mockReset().mockResolvedValue({
      id: "ca-1",
      access_token: "token-1",
      refresh_token: "refresh-1",
      expires_at: null,
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // The service logs every cache miss and cache clear.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getEvents", () => {
    it("emits a UTC-declared time as an explicit instant, trimmed to milliseconds", async () => {
      respondWith({ value: [graphEvent()] });

      const [event] = await service.getEvents(userId, range);

      expect(event!.start).toEqual({
        dateTime: "2026-10-05T14:00:00.000Z",
        date: undefined,
        timeZone: "UTC",
      });
      expect(event!.end.dateTime).toBe("2026-10-05T15:00:00.000Z");
    });

    describe("for a viewer east of UTC", () => {
      // Pinned so the case fails on a UTC runner too: there an offset-less
      // string and the instant it stands for happen to coincide.
      const originalTz = process.env.TZ;
      beforeEach(() => {
        process.env.TZ = "Europe/Berlin";
      });
      afterEach(() => {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      });

      it("parses to the meeting's instant, so 16:00 CEST renders as 4 PM", async () => {
        respondWith({ value: [graphEvent()] });

        const [event] = await service.getEvents(userId, range);

        // The calendar UI's parser, then the one the server-side readers use.
        expect(format(parseISO(event!.start.dateTime!), "h:mm a")).toBe("4:00 PM");
        expect(format(parseISO(event!.end.dateTime!), "h:mm a")).toBe("5:00 PM");
        expect(new Date(event!.start.dateTime!).toISOString()).toBe(
          "2026-10-05T14:00:00.000Z",
        );
      });
    });

    it("reads the same instant the calendar sync does", async () => {
      respondWith({ value: [graphEvent()] });

      const [event] = await service.getEvents(userId, range);
      const row = normalizeProviderEvent(event!);

      expect(row!.startsAt.toISOString()).toBe("2026-10-05T14:00:00.000Z");
      expect(row!.endsAt.toISOString()).toBe("2026-10-05T15:00:00.000Z");
    });

    it("keeps all-day events date-only", async () => {
      respondWith({
        value: [
          graphEvent({
            isAllDay: true,
            start: { dateTime: "2026-10-05T00:00:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2026-10-06T00:00:00.0000000", timeZone: "UTC" },
          }),
        ],
      });

      const [event] = await service.getEvents(userId, range);

      expect(event!.start).toMatchObject({ date: "2026-10-05", dateTime: undefined });
      expect(event!.end).toMatchObject({ date: "2026-10-06", dateTime: undefined });
    });

    it.each([
      // What a `Prefer: outlook.timezone` response would look like: a wall-clock
      // time in the named zone, which is not the instant a Z would claim.
      ["a time declared in another zone", "2026-10-05T16:00:00.0000000", "W. Europe Standard Time"],
      ["a time that already carries an offset", "2026-10-05T14:00:00Z", "UTC"],
    ])("passes %s through untouched", async (_label, dateTime, timeZone) => {
      respondWith({ value: [graphEvent({ start: { dateTime, timeZone } })] });

      const [event] = await service.getEvents(userId, range);

      expect(event!.start).toMatchObject({ dateTime, timeZone });
    });
  });

  describe("createEvent", () => {
    it("returns the created event's times as explicit instants too", async () => {
      respondWith(graphEvent(), 201);

      const created = await service.createEvent(userId, {
        summary: "Planning",
        start: { dateTime: "2026-10-05T14:00:00.000Z", timeZone: "UTC" },
        end: { dateTime: "2026-10-05T15:00:00.000Z", timeZone: "UTC" },
      });

      expect(created.start).toEqual({ dateTime: "2026-10-05T14:00:00.000Z", timeZone: "UTC" });
      expect(created.end).toEqual({ dateTime: "2026-10-05T15:00:00.000Z", timeZone: "UTC" });
    });
  });
});
