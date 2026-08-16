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
 * node-ical parses VALUE=DATE values as *server-local* midnight, which makes
 * the stored instant depend on the machine's timezone. Re-anchor all-day
 * dates to UTC midnight of the same calendar date, so a stored all-day row
 * always renders as `toISOString().slice(0, 10)` regardless of server TZ.
 */
function allDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Aggregate cap across ALL events in one feed. node-ical's rrule backend caps
 * a single rule at 10k iterations, but a crafted 5 MB feed can carry
 * thousands of separate hourly RRULEs — unbounded in aggregate, enough to
 * OOM the sync function. Exceeding this fails the sync (prior events are
 * retained) rather than truncating silently.
 */
const MAX_EVENTS_PER_FEED = 10_000;

/** Keep events overlapping the window; zero-duration events count when their instant is inside. */
function overlapsWindow(startsAt: Date, endsAt: Date, window: { from: Date; to: Date }): boolean {
  return (
    startsAt < window.to &&
    (endsAt > window.from ||
      (endsAt.getTime() === startsAt.getTime() && endsAt >= window.from))
  );
}

/**
 * Parse ICS text into normalized events overlapping `window`.
 *
 * Recurring events are expanded into concrete instances within the window —
 * RRULE (honoring COUNT/UNTIL), EXDATE exclusions, and RECURRENCE-ID
 * overrides (a moved instance carries its override's time/title/location).
 * Cancelled events and cancelled override instances are dropped. An event
 * with no DTEND gets the RFC 5545 default duration: one day for all-day
 * events, zero otherwise.
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
    if (!event.uid || !(event.start instanceof Date)) continue;

    if (event.rrule) {
      // expandOngoing keeps instances that started before the window but are
      // still running at its start (e.g. a multi-day recurring event).
      // One malformed RRULE (the backend throws past its per-rule iteration
      // cap) skips that event rather than failing the whole feed.
      let instances: ReturnType<typeof ical.expandRecurringEvent>;
      try {
        instances = ical.expandRecurringEvent(event, {
          from: window.from,
          to: window.to,
          expandOngoing: true,
        });
      } catch {
        continue;
      }
      for (const instance of instances) {
        // A cancelled RECURRENCE-ID override is how feeds delete one
        // instance without an EXDATE.
        if (instance.event.status === "CANCELLED") continue;
        const isAllDay = instance.isFullDay;
        const startsAt = isAllDay ? allDayUtc(instance.start) : instance.start;
        const endsAt = isAllDay ? allDayUtc(instance.end) : instance.end;
        if (!overlapsWindow(startsAt, endsAt, window)) continue;
        // Checked per push (not at the end) so a crafted feed can't
        // accumulate millions of instances before the cap fires.
        if (events.length >= MAX_EVENTS_PER_FEED) {
          throw new FeedFetchError(
            `Feed expands to more than ${MAX_EVENTS_PER_FEED} events inside the sync window.`,
          );
        }
        events.push({
          externalId: event.uid,
          // instance.event is the override VEVENT for moved instances, the
          // base event otherwise — so overridden titles/locations stick.
          title: textOf(instance.event.summary ?? event.summary),
          location: textOf(instance.event.location ?? event.location),
          startsAt,
          endsAt,
          isAllDay,
        });
      }
      continue;
    }

    if (event.status === "CANCELLED") continue;

    const isAllDay = event.datetype === "date";
    const rawStart = event.start;
    const rawEnd =
      event.end instanceof Date
        ? event.end
        : new Date(rawStart.getTime() + (isAllDay ? MS_PER_DAY : 0));
    const startsAt = isAllDay ? allDayUtc(rawStart) : rawStart;
    const endsAt = isAllDay ? allDayUtc(rawEnd) : rawEnd;

    if (!overlapsWindow(startsAt, endsAt, window)) continue;

    if (events.length >= MAX_EVENTS_PER_FEED) {
      throw new FeedFetchError(
        `Feed expands to more than ${MAX_EVENTS_PER_FEED} events inside the sync window.`,
      );
    }
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

  const syncedAt = new Date();

  // Stamp the attempt before doing anything fallible — the cron sweep orders
  // by this, so even a sync that crashes mid-flight moves to the back of the
  // queue instead of starving every other feed.
  await db.calendarFeed.update({
    where: { id: feedId },
    data: { lastSyncAttemptAt: syncedAt },
  });

  // Set once the URL decrypts; used to keep the bearer-secret URL out of
  // every stored/reported error message.
  let decryptedUrl: string | null = null;

  const recordFailure = async (
    message: string,
    cause?: unknown,
  ): Promise<SyncFeedResult> => {
    // An ICS URL is a bearer secret (ADR-0057): never let it reach
    // lastSyncError, which listFeeds returns to the client.
    const redacted = decryptedUrl
      ? message.split(decryptedUrl).join("<feed url>")
      : message;
    // Report only the *transition* into error state, not every recurring
    // failure — a feed stuck broken for weeks should be findable in Sentry
    // without each 15-minute sweep re-alerting. Imported lazily: the static
    // import chain reaches ~/server/db, whose env validation breaks the pure
    // parse tests that import this module.
    if (feed.syncStatus !== "error") {
      try {
        const { reportHandledErrorServer } = await import(
          "~/server/utils/reportHandledErrorServer"
        );
        reportHandledErrorServer(cause ?? new Error(redacted), {
          area: "calendar.syncFeed",
          context: { feedId },
        });
      } catch {
        // Reporting must never break the sync flow.
      }
    }
    await db.calendarFeed.update({
      where: { id: feedId },
      data: { syncStatus: "error", lastSyncError: redacted.slice(0, 500) },
    });
    return { ok: false, error: redacted };
  };

  const url = decryptFromBase64(feed.urlEncrypted);
  if (!url) {
    return recordFailure(
      "Could not decrypt the feed URL — check DATABASE_ENCRYPTION_KEY.",
    );
  }
  decryptedUrl = url;

  let parsed: ParsedIcsFeed;
  try {
    const icsText = await fetchIcsText(url, resolveHost);
    // Expired/revoked published-calendar links commonly 200 with an HTML
    // sign-in page; parsing that yields zero events and would otherwise wipe
    // the feed's rows while reporting "ok". Not a calendar → sync failure.
    if (!/^BEGIN:VCALENDAR/m.test(icsText)) {
      return recordFailure(
        "The URL did not return an ICS calendar (got HTML or other content).",
      );
    }
    parsed = parseIcsFeed(icsText, getSyncWindow(syncedAt));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return recordFailure(message, error);
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

/**
 * Feeds per cron invocation. Bounded so the sweep always fits the function
 * timeout — leftovers are oldest-first next run, and the every-15-minutes
 * cadence with this cap comfortably covers the ≤30-minute freshness
 * requirement.
 */
const SYNC_BATCH_SIZE = 50;

export interface CalendarSweepResult {
  processed: number;
  succeeded: number;
  failed: { feedId: string; error: string }[];
}

/**
 * One bounded cron sweep: re-sync the enabled feeds that have gone longest
 * without a sync (never-synced first). Failures are recorded per-feed by
 * `syncFeed` and reported here; one broken feed never stops the sweep.
 */
export async function runCalendarSync(
  db: PrismaClient,
  resolveHost?: ResolveHost,
): Promise<CalendarSweepResult> {
  // Ordered by ATTEMPT time, not success time — a feed that fails every
  // sync still advances to the back of the queue, so broken feeds can't
  // monopolize the batch and starve healthy ones.
  const feeds = await db.calendarFeed.findMany({
    where: { isEnabled: true },
    select: { id: true },
    orderBy: { lastSyncAttemptAt: { sort: "asc", nulls: "first" } },
    take: SYNC_BATCH_SIZE,
  });

  const result: CalendarSweepResult = { processed: feeds.length, succeeded: 0, failed: [] };

  // Sequential on purpose: feed hosts are third parties, and a serverless
  // function fanning out N concurrent fetches is how timeouts get flaky.
  for (const feed of feeds) {
    const outcome = await syncFeed(db, feed.id, resolveHost);
    if (outcome.ok) {
      result.succeeded += 1;
    } else {
      result.failed.push({ feedId: feed.id, error: outcome.error });
    }
  }

  return result;
}
