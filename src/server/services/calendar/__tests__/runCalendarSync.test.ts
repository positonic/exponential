/**
 * The calendar cron's failure handling (windy.bell): one source that throws
 * must not fail the sweep, and a source that is merely unreachable or
 * revoked is recorded on the source — where the UI shows it — but not
 * reported to Sentry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const report = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: report }));
vi.mock("~/server/utils/encryption", () => ({ decryptFromBase64: () => "https://feeds.example.com/cal.ics" }));
vi.mock("~/lib/googleAuth", () => ({ isGoogleOAuthTester: () => true }));

import { isExpectedSourceFailure, FeedFetchError, runCalendarSync, syncFeed } from "../CalendarSyncService";
import { IntegrationAuthError } from "~/server/utils/integrationErrors";

const resolvePublic = async () => ["93.184.216.34"];

describe("calendar sweep failure isolation", () => {
  const db = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
    report.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps sweeping when one feed's sync throws, and reports only that unexpected throw", async () => {
    db.calendarFeed.findMany.mockResolvedValue([{ id: "feed-broken" }, { id: "feed-gone" }] as never);
    db.calendarFeed.findUnique.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "feed-broken") return Promise.reject(new Error("Connection pool timeout"));
      return Promise.resolve(null);
    }) as never);
    db.connectedAccount.findMany.mockResolvedValue([]);

    const result = await runCalendarSync(db, resolvePublic);

    expect(result.processed).toBe(2);
    expect(result.failed).toEqual([
      { feedId: "feed-broken", error: "Connection pool timeout" },
      { feedId: "feed-gone", error: "Feed not found" },
    ]);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![1]).toMatchObject({ context: { feedId: "feed-broken" } });
  });

  it("reserves sweep time for connected accounts when feeds are slow", async () => {
    // Every feed sync "takes" 50s of wall clock.
    let clock = 1_000_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    db.calendarFeed.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ id: `feed-${i}` })) as never,
    );
    db.calendarFeed.findUnique.mockImplementation((() => {
      clock += 50_000;
      return Promise.resolve(null);
    }) as never);
    db.connectedAccount.findMany.mockResolvedValue([
      { id: "acct-1", provider: "microsoft-entra-id", user: { email: "a@example.com" } },
    ] as never);
    // syncConnectedAccount finds no account row: a cheap, recorded failure —
    // what matters is that it was attempted at all.
    db.connectedAccount.findUnique.mockResolvedValue(null);

    try {
      const result = await runCalendarSync(db, resolvePublic);
      // Feeds start at 0s, 50s and 100s; at 150s the 144s feed share is
      // spent, so the remaining 7 wait for the next sweep.
      expect(result.failed).toHaveLength(3);
      expect(result.accounts.processed).toBe(1);
      expect(result.accounts.failed).toEqual([{ accountId: "acct-1", error: "Account not found" }]);
    } finally {
      now.mockRestore();
    }
  });

  it("records an unreachable feed host on the feed without reporting it", async () => {
    db.calendarFeed.findUnique.mockResolvedValue({
      id: "feed-1",
      urlEncrypted: "enc",
      syncStatus: "ok",
      timezone: null,
    } as never);
    db.calendarFeed.update.mockResolvedValue({} as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const result = await syncFeed(db, "feed-1", resolvePublic);

    expect(result.ok).toBe(false);
    expect(report).not.toHaveBeenCalled();
    const stored = db.calendarFeed.update.mock.calls.at(-1)![0].data as { syncStatus: string; lastSyncError: string };
    expect(stored.syncStatus).toBe("error");
    expect(stored.lastSyncError).toMatch(/could not be reached/);
  });
});

describe("isExpectedSourceFailure", () => {
  it("treats feed HTTP failures, revoked grants, timeouts and network errors as expected", () => {
    expect(isExpectedSourceFailure(new FeedFetchError("Feed fetch failed with HTTP 404."))).toBe(true);
    expect(isExpectedSourceFailure(new IntegrationAuthError("Outlook Calendar", "Please reconnect"))).toBe(true);
    expect(isExpectedSourceFailure(new TypeError("fetch failed"))).toBe(true);
    expect(isExpectedSourceFailure(new DOMException("timed out", "TimeoutError"))).toBe(true);
  });

  it("treats anything else as a real fault", () => {
    expect(isExpectedSourceFailure(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});
