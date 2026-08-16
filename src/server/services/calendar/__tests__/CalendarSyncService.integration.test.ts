/**
 * Integration test for the delete-and-replace feed sync transaction — the one
 * path that genuinely needs a real DB: the `[userId, sourceType, externalId,
 * startsAt]` uniqueness contract and the failure mode where a broken fetch
 * must leave previously synced rows untouched.
 *
 * The network is stubbed (fetch + DNS); only Postgres is real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { getTestDb } from "~/test/test-db";
import { createUser } from "~/test/factories";
import { syncFeed } from "../CalendarSyncService";
import { encryptToBase64 } from "~/server/utils/encryption";

const FEED_URL = "https://feeds.example.com/team.ics";
const resolvePublic = async () => ["93.184.216.34"];

function calendar(veventBlocks: string[][]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//exponential-tests//EN",
    "X-WR-TIMEZONE:Europe/Berlin",
    ...veventBlocks.flat(),
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(uid: string, startIso: string, endIso: string, summary: string): string[] {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20260801T000000Z",
    `DTSTART:${fmt(startIso)}`,
    `DTEND:${fmt(endIso)}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ];
}

// Fixture dates must sit inside the rolling −1wk/+8wk window at test runtime.
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const startA = new Date(NOW + 2 * DAY).toISOString();
const endA = new Date(NOW + 2 * DAY + 60 * 60 * 1000).toISOString();
const startB = new Date(NOW + 3 * DAY).toISOString();
const endB = new Date(NOW + 3 * DAY + 60 * 60 * 1000).toISOString();

function stubFeedResponse(body: string, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

describe("syncFeed — delete-and-replace transaction", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedFeed() {
    const user = await createUser(db);
    const feed = await db.calendarFeed.create({
      data: {
        userId: user.id,
        name: "Team",
        urlEncrypted: encryptToBase64(FEED_URL),
      },
    });
    return { user, feed };
  }

  it("persists events on first sync and records ok status + feed timezone", async () => {
    const { user, feed } = await seedFeed();
    stubFeedResponse(
      calendar([vevent("evt-a", startA, endA, "A"), vevent("evt-b", startB, endB, "B")]),
    );

    const result = await syncFeed(db, feed.id, resolvePublic);

    expect(result).toMatchObject({ ok: true, eventCount: 2 });
    const rows = await db.calendarEvent.findMany({
      where: { userId: user.id },
      orderBy: { startsAt: "asc" },
    });
    expect(rows.map((r) => r.externalId)).toEqual(["evt-a", "evt-b"]);
    expect(rows[0]).toMatchObject({ sourceType: "ics", calendarFeedId: feed.id, title: "A" });

    const updated = await db.calendarFeed.findUniqueOrThrow({ where: { id: feed.id } });
    expect(updated.syncStatus).toBe("ok");
    expect(updated.lastSyncError).toBeNull();
    expect(updated.lastSyncedAt).not.toBeNull();
    expect(updated.timezone).toBe("Europe/Berlin");
  });

  it("collapses duplicate (uid, start) rows instead of failing the unique constraint", async () => {
    const { user, feed } = await seedFeed();
    stubFeedResponse(
      calendar([vevent("evt-dup", startA, endA, "First"), vevent("evt-dup", startA, endA, "Second")]),
    );

    const result = await syncFeed(db, feed.id, resolvePublic);

    expect(result.ok).toBe(true);
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
  });

  it("replaces prior rows on re-sync (removed events disappear)", async () => {
    const { user, feed } = await seedFeed();
    stubFeedResponse(
      calendar([vevent("evt-a", startA, endA, "A"), vevent("evt-b", startB, endB, "B")]),
    );
    await syncFeed(db, feed.id, resolvePublic);

    // evt-b vanished upstream, evt-a was renamed.
    stubFeedResponse(calendar([vevent("evt-a", startA, endA, "A renamed")]));
    const result = await syncFeed(db, feed.id, resolvePublic);

    expect(result).toMatchObject({ ok: true, eventCount: 1 });
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: "evt-a", title: "A renamed" });
  });

  it("keeps previously synced rows and records the error when the fetch fails", async () => {
    const { user, feed } = await seedFeed();
    stubFeedResponse(calendar([vevent("evt-a", startA, endA, "A")]));
    await syncFeed(db, feed.id, resolvePublic);

    stubFeedResponse("upstream broke", 500);
    const result = await syncFeed(db, feed.id, resolvePublic);

    expect(result.ok).toBe(false);
    const rows = await db.calendarEvent.findMany({ where: { userId: user.id } });
    expect(rows.map((r) => r.externalId)).toEqual(["evt-a"]);

    const updated = await db.calendarFeed.findUniqueOrThrow({ where: { id: feed.id } });
    expect(updated.syncStatus).toBe("error");
    expect(updated.lastSyncError).toMatch(/HTTP 500/);
  });

  it("recovers to ok status once the feed fetch succeeds again", async () => {
    const { feed } = await seedFeed();
    stubFeedResponse("nope", 500);
    await syncFeed(db, feed.id, resolvePublic);

    stubFeedResponse(calendar([vevent("evt-a", startA, endA, "A")]));
    const result = await syncFeed(db, feed.id, resolvePublic);

    expect(result.ok).toBe(true);
    const updated = await db.calendarFeed.findUniqueOrThrow({ where: { id: feed.id } });
    expect(updated.syncStatus).toBe("ok");
    expect(updated.lastSyncError).toBeNull();
  });
});
