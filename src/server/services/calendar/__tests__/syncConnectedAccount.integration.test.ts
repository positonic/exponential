/**
 * Integration test for the V2 busy-time account sync: a Microsoft
 * ConnectedAccount's events land in CalendarEvent via the stored token, with
 * the same delete-and-replace and failure-retention contract as feed sync.
 *
 * Microsoft Graph is stubbed at the fetch layer; the account carries a
 * non-expired access token so no token-refresh round trip happens. Only
 * Postgres is real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser } from "~/test/factories";
import { syncConnectedAccount, runCalendarSync } from "../CalendarSyncService";

const DAY = 24 * 60 * 60 * 1000;
const startA = new Date(Date.now() + 2 * DAY);
const endA = new Date(startA.getTime() + 60 * 60 * 1000);

/** Graph calendarView payload: UTC local-time strings without offset. */
function graphPayload(events: { id: string; subject: string; start: Date; end: Date }[]) {
  const fmt = (d: Date) => d.toISOString().replace(/Z$/, "0000");
  return {
    value: events.map((e) => ({
      id: e.id,
      subject: e.subject,
      bodyPreview: "",
      start: { dateTime: fmt(e.start), timeZone: "UTC" },
      end: { dateTime: fmt(e.end), timeZone: "UTC" },
      location: { displayName: "Room 1" },
      attendees: [],
      webLink: "https://outlook.example/e",
      showAs: "busy",
      isCancelled: false,
      isAllDay: false,
    })),
  };
}

function stubGraph(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status })),
  );
}

describe("syncConnectedAccount — Microsoft busy-time sync", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedAccount() {
    const user = await createUser(db);
    const account = await db.connectedAccount.create({
      data: {
        userId: user.id,
        provider: "microsoft-entra-id",
        providerAccountId: `ms-${user.id}`,
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        // Non-expired, so getAccessToken uses the stored token directly.
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: "Calendars.Read",
      },
    });
    return { user, account };
  }

  it("persists busy rows queryable server-side with no session in hand", async () => {
    const { user, account } = await seedAccount();
    stubGraph(graphPayload([{ id: "graph-1", subject: "Design sync", start: startA, end: endA }]));

    const result = await syncConnectedAccount(db, account.id);

    expect(result).toMatchObject({ ok: true, eventCount: 1 });
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceType: "microsoft",
      connectedAccountId: account.id,
      providerCalendarId: "primary",
      externalId: "graph-1",
      title: "Design sync",
      isAllDay: false,
    });
    // The UTC-without-offset Graph string round-trips to the exact instant.
    expect(rows[0]!.startsAt.getTime()).toBe(startA.getTime());

    const updated = await db.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updated.calendarSyncStatus).toBe("ok");
    expect(updated.calendarLastSyncedAt).not.toBeNull();
  });

  it("keeps prior rows and marks the account on API failure, stamping the attempt", async () => {
    const { user, account } = await seedAccount();
    stubGraph(graphPayload([{ id: "graph-1", subject: "Keep me", start: startA, end: endA }]));
    await syncConnectedAccount(db, account.id);

    stubGraph({ error: { code: "InvalidAuthenticationToken" } }, 401);
    const result = await syncConnectedAccount(db, account.id);

    expect(result.ok).toBe(false);
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows.map((r) => r.externalId)).toEqual(["graph-1"]);

    const updated = await db.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updated.calendarSyncStatus).toBe("error");
    expect(updated.calendarLastSyncError).toBeTruthy();
    expect(updated.calendarLastSyncAttemptAt).not.toBeNull();
  });

  it("replaces rows on re-sync (events removed upstream disappear)", async () => {
    const { user, account } = await seedAccount();
    stubGraph(
      graphPayload([
        { id: "graph-1", subject: "A", start: startA, end: endA },
        { id: "graph-2", subject: "B", start: endA, end: new Date(endA.getTime() + DAY) },
      ]),
    );
    await syncConnectedAccount(db, account.id);

    stubGraph(graphPayload([{ id: "graph-1", subject: "A", start: startA, end: endA }]));
    await syncConnectedAccount(db, account.id);

    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows.map((r) => r.externalId)).toEqual(["graph-1"]);
  });

  it("skips Google accounts of non-testers, sweeps Google testers", async () => {
    const nonTester = await createUser(db, { email: "regular@example.com" });
    await db.connectedAccount.create({
      data: {
        userId: nonTester.id,
        provider: "google",
        providerAccountId: `g-${nonTester.id}`,
        access_token: "tok",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    const tester = await createUser(db, { email: "tester@example.com" });
    const testerAccount = await db.connectedAccount.create({
      data: {
        userId: tester.id,
        provider: "google",
        providerAccountId: `g-${tester.id}`,
        access_token: "tok",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    vi.stubEnv("GOOGLE_OAUTH_TESTER_EMAILS", "tester@example.com");
    // Whatever the Google client does under the hood, this run must never
    // reach the real API — a failing stub still proves "attempted".
    stubGraph({ error: "stubbed" }, 500);
    try {
      const result = await runCalendarSync(db);

      // Only the tester's account was attempted at all.
      expect(result.accounts.processed).toBe(1);
      const testerRow = await db.connectedAccount.findUniqueOrThrow({
        where: { id: testerAccount.id },
      });
      expect(testerRow.calendarLastSyncAttemptAt).not.toBeNull();

      const nonTesterRow = await db.connectedAccount.findFirstOrThrow({
        where: { userId: nonTester.id },
      });
      expect(nonTesterRow.calendarLastSyncAttemptAt).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("runCalendarSync sweeps Microsoft accounts alongside feeds", async () => {
    const { user, account } = await seedAccount();
    stubGraph(graphPayload([{ id: "graph-1", subject: "Swept", start: startA, end: endA }]));

    const result = await runCalendarSync(db);

    expect(result.accounts.processed).toBe(1);
    expect(result.accounts.succeeded).toBe(1);
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.connectedAccountId).toBe(account.id);
  });
});
