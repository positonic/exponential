/**
 * Unit tests for the calendar router's ConnectedAccount behaviour (ADR-0009).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety"). These assert the router logic that
 * the multi-account redesign depends on: disconnect hard-deletes the
 * ConnectedAccount, and calendar selection upserts keyed by connectedAccountId.
 * The cascade itself is a schema/FK guarantee (covered by Prisma), and the
 * full OAuth round-trip is left to a future integration test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: vi.fn().mockResolvedValue(true),
}));

import { createMockCaller } from "~/test/trpc-helpers";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";
import { CalendarEventPermissionError } from "~/server/services/CalendarProvider";

describe("calendar router — ConnectedAccount (mocked)", () => {
  const userId = "user-1";
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
  });

  describe("disconnect", () => {
    it("hard-deletes the resolved ConnectedAccount by id", async () => {
      // resolveAccount(accountId) → the connected account
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);
      dbMock.connectedAccount.delete.mockResolvedValue({ id: "ca-1" } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.disconnect({ accountId: "ca-1" });

      expect(res.success).toBe(true);
      expect(dbMock.connectedAccount.delete).toHaveBeenCalledWith({
        where: { id: "ca-1" },
      });
      // Old soft-disconnect path (nulling tokens via update) must NOT run.
      expect(dbMock.connectedAccount.update).not.toHaveBeenCalled();
    });

    it("is a no-op when no connected account resolves", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue(null);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.disconnect({ accountId: "missing" });

      expect(res.success).toBe(true);
      expect(dbMock.connectedAccount.delete).not.toHaveBeenCalled();
    });
  });

  describe("updateSelectedCalendars", () => {
    it("upserts the preference keyed by connectedAccountId", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);
      dbMock.calendarPreference.upsert.mockResolvedValue({
        selectedCalendarIds: ["primary", "team@group.calendar.google.com"],
      } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.updateSelectedCalendars({
        accountId: "ca-1",
        calendarIds: ["primary", "team@group.calendar.google.com"],
      });

      expect(res.success).toBe(true);
      const arg = dbMock.calendarPreference.upsert.mock.calls[0]![0];
      expect(arg.where).toEqual({ connectedAccountId: "ca-1" });
      expect(arg.create).toMatchObject({ connectedAccountId: "ca-1", userId });
    });

    it("throws when no connected account resolves", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue(null);
      const caller = createMockCaller({ userId, db: dbMock });
      await expect(
        caller.calendar.updateSelectedCalendars({
          accountId: "missing",
          calendarIds: ["primary"],
        }),
      ).rejects.toThrow();
    });
  });

  describe("deleteEvent", () => {
    const deleteSpy = vi.spyOn(GoogleCalendarService.prototype, "deleteEvent");

    beforeEach(() => {
      // createMockCaller's session email — on the allowlist, so Google isn't gated.
      vi.stubEnv("GOOGLE_OAUTH_TESTER_EMAILS", `${userId}@test.com`);
      deleteSpy.mockReset().mockResolvedValue({ alreadyGone: false });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("deletes at the provider through the caller's own connected account", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.deleteEvent({
        eventId: "evt-1",
        calendarId: "team@group.calendar.google.com",
        accountId: "ca-1",
      });

      expect(res).toEqual({ success: true, alreadyGone: false });
      // The account lookup is what stops one user deleting through another's connection.
      expect(dbMock.connectedAccount.findFirst.mock.calls[0]![0]!.where).toEqual({
        id: "ca-1",
        userId,
      });
      expect(deleteSpy).toHaveBeenCalledWith(userId, {
        eventId: "evt-1",
        calendarId: "team@group.calendar.google.com",
        accountId: "ca-1",
        notifyAttendees: true,
      });
    });

    it("refuses an account that isn't the caller's without touching the provider", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue(null);

      const caller = createMockCaller({ userId, db: dbMock });
      await expect(
        caller.calendar.deleteEvent({ eventId: "evt-1", calendarId: "primary", accountId: "someone-elses" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it.each([
      ["a dot-segment event id", { eventId: "..", calendarId: "primary", accountId: "ca-1" }],
      ["an empty account id", { eventId: "evt-1", calendarId: "primary", accountId: "" }],
      ["an empty calendar id", { eventId: "evt-1", calendarId: "", accountId: "ca-1" }],
    ])("rejects %s before any account lookup or provider call", async (_label, input) => {
      const caller = createMockCaller({ userId, db: dbMock });

      await expect(caller.calendar.deleteEvent(input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      // ".." would collapse the provider URL onto the calendar itself; "" would
      // fall through resolveAccount to the user's first account.
      expect(dbMock.connectedAccount.findFirst).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("passes on that the event was already gone, so the client doesn't claim a delete", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);
      deleteSpy.mockResolvedValue({ alreadyGone: true });

      const caller = createMockCaller({ userId, db: dbMock });
      const res = await caller.calendar.deleteEvent({ eventId: "evt-1", calendarId: "primary", accountId: "ca-1" });

      expect(res).toEqual({ success: true, alreadyGone: true });
    });

    it("reports a provider refusal as FORBIDDEN", async () => {
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);
      deleteSpy.mockRejectedValue(new CalendarEventPermissionError());

      const caller = createMockCaller({ userId, db: dbMock });
      await expect(
        caller.calendar.deleteEvent({ eventId: "evt-1", calendarId: "primary", accountId: "ca-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("stays closed to users outside the Google allowlist", async () => {
      vi.stubEnv("GOOGLE_OAUTH_TESTER_EMAILS", "someone-else@test.com");
      dbMock.connectedAccount.findFirst.mockResolvedValue({
        id: "ca-1",
        provider: "google",
      } as never);

      const caller = createMockCaller({ userId, db: dbMock });
      await expect(
        caller.calendar.deleteEvent({ eventId: "evt-1", calendarId: "primary", accountId: "ca-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });
});
