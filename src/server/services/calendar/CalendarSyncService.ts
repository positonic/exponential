/**
 * ICS calendar feed sync.
 *
 * Pure core (`parseIcsFeed`) + impure shell (`fetchIcsText`, `syncFeed`).
 * Events are persisted into `CalendarEvent` with a delete-and-replace inside
 * the rolling sync window, so a fetch/parse failure leaves the previously
 * synced events untouched and only flips the feed's `syncStatus`.
 */

import ical from "node-ical";
import type { PrismaClient } from "@prisma/client";

import { decryptFromBase64 } from "~/server/utils/encryption";
import { type ResolveHost } from "~/server/utils/privateAddress";
import { assertSafeFeedUrl } from "./feedUrlGuard";

/** Rolling sync window: −1 week / +8 weeks around "now". */
export function getSyncWindow(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 56 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export interface NormalizedEvent {
  externalId: string;
  title: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  isAllDay: boolean;
}

export interface ParsedIcsFeed {
  events: NormalizedEvent[];
  /** X-WR-CALNAME, when the feed declares one. */
  calendarName?: string;
  /** X-WR-TIMEZONE, when the feed declares one. */
  calendarTimezone?: string;
}

/** node-ical text props can be a bare string or `{ val, params }`. */
function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "val" in value) {
    const val = (value as { val: unknown }).val;
    return typeof val === "string" ? val : null;
  }
  return null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse ICS text into normalized events overlapping `window`.
 *
 * Recurring events (RRULE) are skipped for now — recurrence expansion lands
 * separately. Cancelled events are dropped. An event with no DTEND gets the
 * RFC 5545 default duration: one day for all-day events, zero otherwise.
 */
export function parseIcsFeed(
  icsText: string,
  window: { from: Date; to: Date },
): ParsedIcsFeed {
  const parsed = ical.sync.parseICS(icsText);

  const calendarName = parsed.vcalendar?.["WR-CALNAME"];
  const calendarTimezone = parsed.vcalendar?.["WR-TIMEZONE"];

  const events: NormalizedEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component;

    // Recurrence expansion is a separate slice.
    if (event.rrule) continue;
    if (event.status === "CANCELLED") continue;
    if (!event.uid || !(event.start instanceof Date)) continue;

    const isAllDay = event.datetype === "date";
    const startsAt = event.start;
    const endsAt =
      event.end instanceof Date
        ? event.end
        : new Date(startsAt.getTime() + (isAllDay ? MS_PER_DAY : 0));

    // Keep events overlapping the window (end exclusive on both sides, with
    // zero-duration events kept when their instant is inside the window).
    const overlaps =
      startsAt < window.to &&
      (endsAt > window.from ||
        (endsAt.getTime() === startsAt.getTime() && endsAt >= window.from));
    if (!overlaps) continue;

    events.push({
      externalId: event.uid,
      title: textOf(event.summary),
      location: textOf(event.location),
      startsAt,
      endsAt,
      isAllDay,
    });
  }

  return {
    events,
    calendarName: calendarName ?? undefined,
    calendarTimezone: calendarTimezone ?? undefined,
  };
}

/** Feeds larger than this are refused — a calendar file has no business being bigger. */
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export class FeedFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedFetchError";
  }
}

/**
 * Fetch ICS text from a feed URL with the SSRF guard applied to the initial
 * URL and to every redirect hop, a response size cap, and a timeout.
 */
export async function fetchIcsText(
  rawUrl: string,
  resolveHost?: ResolveHost,
): Promise<string> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeFeedUrl(currentUrl, resolveHost);

    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FeedFetchError(`Feed redirected (HTTP ${response.status}) without a Location header.`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new FeedFetchError(`Feed fetch failed with HTTP ${response.status}.`);
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
      throw new FeedFetchError("Feed is larger than the 5 MB limit.");
    }

    if (!response.body) return response.text();

    // Stream with a byte cap — content-length is advisory at best.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new FeedFetchError("Feed is larger than the 5 MB limit.");
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8").decode(merged);
  }

  throw new FeedFetchError(`Feed redirected more than ${MAX_REDIRECTS} times.`);
}

export type SyncFeedResult =
  | { ok: true; eventCount: number; calendarName?: string; calendarTimezone?: string }
  | { ok: false; error: string };

/**
 * Re-sync one feed: fetch, parse, and delete-and-replace its `CalendarEvent`
 * rows. On any failure the previously synced rows are left in place and the
 * failure is recorded on the feed (`syncStatus: "error"`, `lastSyncError`).
 */
export async function syncFeed(
  db: PrismaClient,
  feedId: string,
  resolveHost?: ResolveHost,
): Promise<SyncFeedResult> {
  const feed = await db.calendarFeed.findUnique({ where: { id: feedId } });
  if (!feed) return { ok: false, error: "Feed not found" };

  const recordFailure = async (message: string): Promise<SyncFeedResult> => {
    await db.calendarFeed.update({
      where: { id: feedId },
      data: { syncStatus: "error", lastSyncError: message.slice(0, 500) },
    });
    return { ok: false, error: message };
  };

  const url = decryptFromBase64(feed.urlEncrypted);
  if (!url) {
    return recordFailure(
      "Could not decrypt the feed URL — check DATABASE_ENCRYPTION_KEY.",
    );
  }

  let parsed: ParsedIcsFeed;
  const syncedAt = new Date();
  try {
    const icsText = await fetchIcsText(url, resolveHost);
    parsed = parseIcsFeed(icsText, getSyncWindow(syncedAt));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return recordFailure(message);
  }

  await db.$transaction([
    db.calendarEvent.deleteMany({ where: { calendarFeedId: feedId } }),
    db.calendarEvent.createMany({
      data: parsed.events.map((event) => ({
        userId: feed.userId,
        sourceType: "ics",
        calendarFeedId: feedId,
        externalId: event.externalId,
        title: event.title,
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        isAllDay: event.isAllDay,
        syncedAt,
      })),
      skipDuplicates: true,
    }),
    db.calendarFeed.update({
      where: { id: feedId },
      data: {
        syncStatus: "ok",
        lastSyncedAt: syncedAt,
        lastSyncError: null,
        timezone: parsed.calendarTimezone ?? feed.timezone,
      },
    }),
  ]);

  return {
    ok: true,
    eventCount: parsed.events.length,
    calendarName: parsed.calendarName,
    calendarTimezone: parsed.calendarTimezone,
  };
}
