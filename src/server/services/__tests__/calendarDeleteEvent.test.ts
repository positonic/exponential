/**
 * deleteEvent on both calendar providers: what is sent to Google / Graph, and
 * how each provider's failure modes map onto the shared contract — "already
 * gone" resolves as such instead of failing, a refusal is
 * CalendarEventPermissionError.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { eventsDelete, findFirst } = vi.hoisted(() => ({
  eventsDelete: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {
          // tokens are irrelevant to a mocked client
        }
      },
    },
    calendar: () => ({ events: { delete: eventsDelete } }),
  },
}));

vi.mock("~/server/db", () => ({
  db: { connectedAccount: { findFirst, update: vi.fn() } },
}));

import { GoogleCalendarService } from "../GoogleCalendarService";
import { MicrosoftCalendarService } from "../MicrosoftCalendarService";
import { CalendarEventPermissionError } from "../CalendarProvider";

const userId = "user-1";
const target = { eventId: "evt-1", calendarId: "primary", accountId: "ca-1" };

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue({
    id: "ca-1",
    access_token: "token-1",
    refresh_token: "refresh-1",
    expires_at: null,
  });
  // The services log every cache clear and every provider failure.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GoogleCalendarService.deleteEvent", () => {
  let service: GoogleCalendarService;

  beforeEach(() => {
    service = new GoogleCalendarService();
    eventsDelete.mockReset().mockResolvedValue({});
  });

  it("deletes the event on its own calendar, through the given account", async () => {
    const clearCache = vi.spyOn(service, "clearUserCache");

    const result = await service.deleteEvent(userId, {
      eventId: "evt-1",
      calendarId: "team@group.calendar.google.com",
      accountId: "ca-1",
    });

    expect(result).toEqual({ alreadyGone: false });

    expect(findFirst.mock.calls[0]![0].where).toEqual({
      id: "ca-1",
      userId,
      provider: "google",
    });
    expect(eventsDelete.mock.calls[0]![0]).toEqual({
      calendarId: "team@group.calendar.google.com",
      eventId: "evt-1",
      sendUpdates: "all",
    });
    expect(clearCache).toHaveBeenCalledWith(userId);
  });

  it("sends guests nothing when notifyAttendees is off", async () => {
    await service.deleteEvent(userId, { ...target, notifyAttendees: false });

    expect(eventsDelete.mock.calls[0]![0]).toMatchObject({
      calendarId: "primary",
      sendUpdates: "none",
    });
  });

  it.each([404, 410])("reports %i as already gone, not as a delete", async (status) => {
    const clearCache = vi.spyOn(service, "clearUserCache");
    eventsDelete.mockRejectedValue(Object.assign(new Error("gone"), { status }));

    await expect(service.deleteEvent(userId, target)).resolves.toEqual({
      alreadyGone: true,
    });
    // The stale copy must still leave the cache, or it keeps rendering.
    expect(clearCache).toHaveBeenCalledWith(userId);
  });

  it("raises CalendarEventPermissionError when Google refuses", async () => {
    eventsDelete.mockRejectedValue(
      Object.assign(new Error("forbidden"), { response: { status: 403 } }),
    );

    await expect(service.deleteEvent(userId, target)).rejects.toBeInstanceOf(
      CalendarEventPermissionError,
    );
  });

  it("fails on any other error, keeps the cache, and carries the provider error as cause", async () => {
    const clearCache = vi.spyOn(service, "clearUserCache");
    const providerError = Object.assign(new Error("boom"), { status: 500 });
    eventsDelete.mockRejectedValue(providerError);

    const failure = await service.deleteEvent(userId, target).catch((e: Error) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("Failed to delete calendar event");
    // The route handler reports error.cause to Sentry; without it only the generic text survives.
    expect((failure as Error).cause).toBe(providerError);
    expect(clearCache).not.toHaveBeenCalled();
  });
});

describe("MicrosoftCalendarService.deleteEvent", () => {
  let service: MicrosoftCalendarService;
  const fetchMock = vi.fn();

  const respond = (status: number) =>
    fetchMock.mockResolvedValue(new Response(status === 204 ? null : "{}", { status }));

  beforeEach(() => {
    service = new MicrosoftCalendarService();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("DELETEs the event with the given account's token", async () => {
    respond(204);

    const result = await service.deleteEvent(userId, { ...target, eventId: "AAMk/ev=1" });

    expect(result).toEqual({ alreadyGone: false });

    expect(findFirst.mock.calls[0]![0].where).toEqual({
      id: "ca-1",
      userId,
      provider: "microsoft-entra-id",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me/events/AAMk%2Fev%3D1");
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer token-1" });
  });

  it("deletes through the calendar the event was listed from", async () => {
    respond(204);

    await service.deleteEvent(userId, { ...target, calendarId: "AAMk/cal=2" });

    // me/events can't reach an event on a shared calendar, and its 404 would
    // be reported as a successful delete.
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/calendars/AAMk%2Fcal%3D2/events/evt-1",
    );
  });

  it("uses me/events for the default calendar", async () => {
    respond(204);

    await service.deleteEvent(userId, target);

    expect(fetchMock.mock.calls[0]![0]).toBe("https://graph.microsoft.com/v1.0/me/events/evt-1");
  });

  it("reports 404 as already gone, not as a delete", async () => {
    respond(404);

    await expect(service.deleteEvent(userId, target)).resolves.toEqual({
      alreadyGone: true,
    });
  });

  it("raises CalendarEventPermissionError when Graph refuses", async () => {
    respond(403);

    await expect(service.deleteEvent(userId, target)).rejects.toBeInstanceOf(
      CalendarEventPermissionError,
    );
  });

  it("fails on any other error", async () => {
    respond(500);

    await expect(service.deleteEvent(userId, target)).rejects.toThrow(
      "Failed to delete calendar event",
    );
  });
});
