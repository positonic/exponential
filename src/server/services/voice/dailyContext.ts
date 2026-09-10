/**
 * Daily context module — the `get_todays_plan` coarse tool's server side.
 *
 * Reuses the Daily summary digest builder (`buildDailySummary`, ADR-0059 — the
 * same structured digest the Matrix / email morning summary is rendered from)
 * so voice, Matrix and the web all answer "what's on today?" from ONE source:
 *
 *   - today's meetings          (merged calendar, in the user's timezone)
 *   - today's actions           (the `/today` set: scheduled-or-due, ADR-0034)
 *   - overdue actions           (same partition, names + count)
 *   - the current cycle per product the user holds tickets in — progress,
 *     pace, days left, the user's in-flight tickets and what's up next
 *
 * The digest is rendered for SPEECH by `dailyContextSpeakable.ts`: a short
 * overview by default, or one section in full when the caller asks for a
 * `focus`. The overview names a few items per section and counts the rest;
 * the focused renderings enumerate, so a follow-up like "what are they?" can
 * be answered by calling the tool again with the matching focus instead of
 * the transport improvising names.
 *
 * Read-only: never raises the confirmation gate. No LLM.
 */
import type { PrismaClient } from "@prisma/client";

import {
  buildDailySummary,
  type BuildDailySummaryOptions,
  type DailySummaryDigest,
} from "~/server/services/notifications/emit/dailySummary";
import {
  parseTimezone,
  renderDailyContextSpeakable,
  type DailyContextFocus,
} from "~/server/services/voice/dailyContextSpeakable";

export {
  DAILY_CONTEXT_FOCUSES,
  DAILY_CONTEXT_MAX_SPEAKABLE_LENGTH,
  parseDailyContextFocus,
  parseTimezone,
  renderDailyContextSpeakable,
  type DailyContextFocus,
} from "~/server/services/voice/dailyContextSpeakable";

export interface DailyContextOptions {
  /** Injectable "now" for deterministic tests. */
  now?: Date;
  /**
   * IANA timezone the device reports (e.g. "Europe/Berlin"). Invalid or absent
   * → the user's notification-preference timezone, then their profile
   * timezone, then UTC.
   */
  timezone?: string;
  focus?: DailyContextFocus;
  /** Test seam: the digest builder's calendar reader. */
  readCalendar?: BuildDailySummaryOptions["readCalendar"];
}

export interface DailyContextResult {
  speakable: string;
  focus: DailyContextFocus;
  /** The timezone the digest was built in. */
  timezone: string;
  /** The full structured digest, for clients that render rather than speak. */
  digest: DailySummaryDigest;
}

/**
 * Build today's context for a user and render it for speech. Throws when the
 * user no longer exists (the voice token was verified, so that is an error,
 * not a state to speak).
 */
export async function getDailyContext(
  userId: string,
  db: PrismaClient,
  options: DailyContextOptions = {},
): Promise<DailyContextResult> {
  const now = options.now ?? new Date();
  const focus = options.focus ?? "overview";
  const timezone =
    parseTimezone(options.timezone) ?? (await resolveUserTimezone(userId, db));

  const digest = await buildDailySummary(db, userId, now, timezone, {
    readCalendar: options.readCalendar,
  });
  if (!digest) throw new Error(`Daily context: user ${userId} not found`);

  return {
    speakable: renderDailyContextSpeakable(digest, focus),
    focus,
    timezone,
    digest,
  };
}

/**
 * The timezone the Daily summary would fire in for this user (notification
 * preference), else the profile timezone, else UTC. Mirrors `summaries.ts`.
 */
async function resolveUserTimezone(
  userId: string,
  db: PrismaClient,
): Promise<string> {
  const [pref, user] = await Promise.all([
    db.notificationPreference.findFirst({
      where: { userId },
      select: { timezone: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);
  return (
    parseTimezone(pref?.timezone) ?? parseTimezone(user?.timezone) ?? "UTC"
  );
}
