/**
 * deleteEvent on both calendar providers: what is sent to Google / Graph, and
 * how each provider's failure modes map onto the shared contract — "already
 * gone" is success, a refusal is CalendarEventPermissionError.
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

    await service.deleteEvent(userId, {
      eventId: "evt-1",
      calendarId: "team@group.calendar.google.com",
      accountId: "ca-1",
    });

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
    await service.deleteEvent(userId, { eventId: "evt-1", notifyAttendees: false });

    expect(eventsDelete.mock.calls[0]![0]).toMatchObject({
      calendarId: "primary",
      sendUpdates: "none",
    });
  });

  it.each([404, 410])("treats %i (already deleted at Google) as success", async (status) => {
    const clearCache = vi.spyOn(service, "clearUserCache");
    eventsDelete.mockRejectedValue(Object.assign(new Error("gone"), { status }));

    await expect(service.deleteEvent(userId, { eventId: "evt-1" })).resolves.toBeUndefined();
    // The stale copy must still leave the cache, or it keeps rendering.
    expect(clearCache).toHaveBeenCalledWith(userId);
  });

  it("raises CalendarEventPermissionError when Google refuses", async () => {
    eventsDelete.mockRejectedValue(
      Object.assign(new Error("forbidden"), { response: { status: 403 } }),
    );

    await expect(service.deleteEvent(userId, { eventId: "evt-1" })).rejects.toBeInstanceOf(
      CalendarEventPermissionError,
    );
  });

  it("fails on any other error and keeps the cache", async () => {
    const clearCache = vi.spyOn(service, "clearUserCache");
    eventsDelete.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    await expect(service.deleteEvent(userId, { eventId: "evt-1" })).rejects.toThrow(
      "Failed to delete calendar event",
    );
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

    await service.deleteEvent(userId, { eventId: "AAMk/ev=1", accountId: "ca-1" });

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

  it("treats 404 (already deleted in Outlook) as success", async () => {
    respond(404);

    await expect(service.deleteEvent(userId, { eventId: "evt-1" })).resolves.toBeUndefined();
  });

  it("raises CalendarEventPermissionError when Graph refuses", async () => {
    respond(403);

    await expect(service.deleteEvent(userId, { eventId: "evt-1" })).rejects.toBeInstanceOf(
      CalendarEventPermissionError,
    );
  });

  it("fails on any other error", async () => {
    respond(500);

    await expect(service.deleteEvent(userId, { eventId: "evt-1" })).rejects.toThrow(
      "Failed to delete calendar event",
    );
  });
});
