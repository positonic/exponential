import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
} from "date-fns";
import { personNotFound, resolvePersonScope } from "../personPage";
import { gatherVisibleWeek, type VisibleWeek } from "./gather";
import { synthesizeSummary, type SummaryOpenAIClient } from "./synthesize";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h — only the active week goes stale
const REGENERATE_COOLDOWN_MS = 5 * 60 * 1000; // 5min
/**
 * Most summaries one viewer can have a model write in an hour, across every
 * person and week. The cooldown above is per summary, so on its own it would
 * let someone page through many people and weeks, or regenerate many rows at
 * once, and run up model spend without limit.
 */
export const MODEL_WRITES_PER_VIEWER_PER_HOUR = 30;
const BUDGET_WINDOW_MS = 60 * 60 * 1000;
/** `model` value of a row written without a model: a week with nothing visible. */
const CANNED_MODEL = "canned";

/**
 * Person week summary: an AI-written summary of one week of someone else's
 * work, shown on their Person page above the feed.
 *
 * It is written only from the events the viewer can see on that page (see
 * `gatherVisibleWeek`): no meetings, no assigned items, nothing from a
 * workspace the viewer is not in. That is what separates it from the Weekly
 * work digest, which draws on all of a person's own data and stays private to
 * them (ADR-0018). The two never share data or a cache.
 */
export interface PersonWeekSummary {
  isoYear: number;
  isoWeek: number;
  narrative: string;
  highlights: string[];
  /** How many visible events it was written from. */
  eventCount: number;
  /** True when the week held more visible events than one summary reads. */
  truncated: boolean;
  generatedAt: Date;
  /** True when this is a stored summary rather than one just written. */
  cached: boolean;
}

/**
 * A model write was refused: a regenerate inside the cooldown, or the viewer's
 * hourly budget is spent. The router maps it to TOO_MANY_REQUESTS.
 */
export class PersonSummaryRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Too many summaries written recently; retry in ${Math.round(retryAfterMs / 1000)}s`);
    this.name = "PersonSummaryRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Refuse a model call once the viewer has had {@link MODEL_WRITES_PER_VIEWER_PER_HOUR}
 * summaries written in the last hour. Counted from the stored rows, so it holds
 * across server instances. A canned (empty-week) row costs nothing and is not
 * counted. Concurrent requests can overshoot by a few; it is a budget, not a lock.
 */
async function assertModelBudget(
  db: PrismaClient,
  viewerId: string,
  now: Date,
): Promise<void> {
  const written = await db.personWeekSummary.count({
    where: {
      viewerId,
      model: { not: CANNED_MODEL },
      generatedAt: { gte: new Date(now.getTime() - BUDGET_WINDOW_MS) },
    },
  });
  if (written >= MODEL_WRITES_PER_VIEWER_PER_HOUR) {
    throw new PersonSummaryRateLimitError(BUDGET_WINDOW_MS);
  }
}

/**
 * A summary being written right now, with the events it is being written from.
 * A second request for the same viewer, subject and week joins it instead of
 * paying for another model call — but only after the same check a stored row
 * gets, against what THAT request can see (see `getPersonWeekSummary`).
 */
interface PendingSummary {
  eventIds: string[];
  work: Promise<PersonWeekSummary>;
}
const inFlight = new Map<string, PendingSummary>();

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

interface StoredSummary {
  eventIds: string[];
  generatedAt: Date;
}

/**
 * May a stored summary be shown for what the viewer can see right now?
 *
 * The rule that matters is the first one. A stored summary was written from a
 * set of events; if any of them is no longer visible to the viewer (a page
 * went invite-only, a grant was removed, the viewer left a workspace) the text
 * may describe something they can no longer see, so it is never shown again —
 * whatever its age and whichever week it is for.
 *
 * Beyond that it is ordinary staleness: a finished week is shown until its
 * visible events change; the active week is shown for a few hours even as new
 * events arrive, unless it was written when there was nothing to see.
 */
export function isStoredSummaryServable(
  stored: StoredSummary,
  visibleEventIds: string[],
  opts: { isActiveWeek: boolean; now: Date },
): boolean {
  const visible = new Set(visibleEventIds);
  // (A week busier than one summary reads is the newest N events, so on such a
  // week a new event also pushes an old one out of the set and lands here.
  // That errs on the side of rewriting.)
  if (stored.eventIds.some((id) => !visible.has(id))) return false;

  const hasNewEvents = visible.size > stored.eventIds.length;
  if (!hasNewEvents) return true;
  if (!opts.isActiveWeek) return false;
  if (stored.eventIds.length === 0) return false;
  return opts.now.getTime() - stored.generatedAt.getTime() < STALE_AFTER_MS;
}

/**
 * Read, or write and store, the summary of the subject's week as the viewer
 * can see it. One stored row per (viewer, subject, ISO week); a row is only
 * ever served after re-checking it against what the viewer can see now.
 *
 * `target` pages back to an earlier ISO week (never a future one). `force`
 * regenerates, at most once per cooldown.
 */
export async function getPersonWeekSummary(
  db: PrismaClient,
  args: {
    viewerId: string;
    subjectId: string;
    target?: { isoYear: number; isoWeek: number };
    force?: boolean;
    now?: Date;
    openai?: SummaryOpenAIClient;
  },
): Promise<PersonWeekSummary> {
  // The same guard as the page and its feed: a subject the viewer cannot see
  // is NOT_FOUND here too, so the summary cannot be used to probe.
  const scope = await resolvePersonScope(db, args.viewerId, args.subjectId);
  if (scope.isSelf) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Your own page shows your Weekly work digest; there is no summary of yourself.",
    });
  }

  const now = args.now ?? new Date();
  const currentYear = getISOWeekYear(now);
  const currentWeek = getISOWeek(now);
  const isoYear = args.target?.isoYear ?? currentYear;
  const isoWeek = args.target?.isoWeek ?? currentWeek;
  const isActiveWeek = isoYear === currentYear && isoWeek === currentWeek;
  if (isoYear > currentYear || (isoYear === currentYear && isoWeek > currentWeek)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That week has not happened yet.",
    });
  }

  const subject = await db.user.findUnique({
    where: { id: args.subjectId },
    select: { name: true, isAgent: true },
  });
  if (!subject) throw personNotFound();
  const name = subject.name ?? "This person";

  // What the viewer can see of that week right now. Read on every call, cached
  // or not: it is what the stored row is checked against, and it is only
  // database reads.
  const ref = setISOWeek(setISOWeekYear(now, isoYear), isoWeek);
  const week = await gatherVisibleWeek(db, {
    viewerId: args.viewerId,
    subjectId: args.subjectId,
    subjectName: name,
    workspaceIds: scope.visibleWorkspaces.map((workspace) => workspace.id),
    weekStart: startOfISOWeek(ref),
    weekEnd: endOfISOWeek(ref),
  });
  const visibleEventIds = week.events.map((event) => event.id);

  const key = {
    viewerId: args.viewerId,
    subjectId: args.subjectId,
    isoYear,
    isoWeek,
  };
  const existing = await db.personWeekSummary.findUnique({
    where: { viewerId_subjectId_isoYear_isoWeek: key },
  });

  if (existing) {
    const stored = {
      eventIds: jsonStringArray(existing.eventIds),
      generatedAt: existing.generatedAt,
    };
    const servable = isStoredSummaryServable(stored, visibleEventIds, {
      isActiveWeek,
      now,
    });
    const ageMs = now.getTime() - existing.generatedAt.getTime();
    // The cooldown only holds back a summary that could otherwise be shown.
    // One that must not be shown is always rewritten.
    if (args.force && servable && ageMs < REGENERATE_COOLDOWN_MS) {
      throw new PersonSummaryRateLimitError(REGENERATE_COOLDOWN_MS - ageMs);
    }
    if (!args.force && servable) {
      return {
        isoYear,
        isoWeek,
        narrative: existing.narrative,
        highlights: jsonStringArray(existing.highlights),
        eventCount: stored.eventIds.length,
        truncated: existing.truncated,
        generatedAt: existing.generatedAt,
        cached: true,
      };
    }
  }

  // Join a summary that is already being written, forced or not: it is a
  // fresh rewrite either way, so a burst of regenerate clicks costs one model
  // call. The exception is a pending summary written from an event this
  // request can no longer see (access changed while it was being written):
  // that one is never handed to this caller, who writes their own instead.
  const flightKey = `${args.viewerId}:${args.subjectId}:${isoYear}:${isoWeek}`;
  const pending = inFlight.get(flightKey);
  if (pending) {
    const visible = new Set(visibleEventIds);
    if (pending.eventIds.every((id) => visible.has(id))) return pending.work;
  }

  const entry: PendingSummary = {
    eventIds: visibleEventIds,
    work: writeAndStore(db, {
      key,
      subject: { name, isAgent: subject.isAgent },
      week,
      now,
      openai: args.openai,
    }).finally(() => {
      // Only clear our own entry: a later request may have replaced it.
      if (inFlight.get(flightKey) === entry) inFlight.delete(flightKey);
    }),
  };
  inFlight.set(flightKey, entry);
  return entry.work;
}

async function writeAndStore(
  db: PrismaClient,
  args: {
    key: { viewerId: string; subjectId: string; isoYear: number; isoWeek: number };
    subject: { name: string; isAgent: boolean };
    week: VisibleWeek;
    now: Date;
    openai?: SummaryOpenAIClient;
  },
): Promise<PersonWeekSummary> {
  const eventIds = args.week.events.map((event) => event.id);
  const isEmptyWeek = args.week.events.length === 0;
  // Only a model call spends the budget; the canned line below is free.
  if (!isEmptyWeek) await assertModelBudget(db, args.key.viewerId, args.now);

  // Nothing visible: say so without a model call. Stored under the canned
  // model flag so an empty week is not regenerated on every page load.
  const written = isEmptyWeek
    ? {
        // Stored and shown again later, for whichever week the pager is on, so
        // it names no week of its own ("this week", "that week").
        narrative: `${args.subject.name} has no activity you can see in the selected week.`,
        highlights: [],
        model: CANNED_MODEL,
        tokensIn: null,
        tokensOut: null,
      }
    : await synthesizeSummary(args.subject, args.week.events, {
        nonce: randomBytes(8).toString("hex"),
        truncated: args.week.truncated,
        openai: args.openai,
      });

  const data = {
    narrative: written.narrative,
    highlights: written.highlights,
    eventIds,
    truncated: args.week.truncated,
    model: written.model,
    tokensIn: written.tokensIn,
    tokensOut: written.tokensOut,
  };
  const row = await db.personWeekSummary.upsert({
    where: { viewerId_subjectId_isoYear_isoWeek: args.key },
    create: { ...args.key, ...data },
    update: { ...data, generatedAt: new Date() },
  });

  return {
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    narrative: row.narrative,
    highlights: jsonStringArray(row.highlights),
    eventCount: eventIds.length,
    truncated: row.truncated,
    generatedAt: row.generatedAt,
    cached: false,
  };
}
