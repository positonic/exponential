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
import { buildWorkspaceAccessWhere } from "~/server/services/access";
import { gatherWeeklyWorkBundle } from "./gather";
import {
  MODEL,
  synthesizeDigest,
  type DigestOpenAIClient,
} from "./synthesize";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h — only the active week goes stale
const REGENERATE_COOLDOWN_MS = 5 * 60 * 1000; // 5min

export interface WeeklyWorkDigest {
  isoYear: number;
  isoWeek: number;
  narrative: string;
  highlights: string[];
  angles: string[];
  generatedAt: Date;
  cached: boolean;
}

/** Force-regenerate inside the cooldown window. Router maps to TOO_MANY_REQUESTS. */
export class DigestRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Digest regenerated recently; retry in ${Math.round(retryAfterMs / 1000)}s`);
    this.name = "DigestRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

const inFlight = new Map<string, Promise<WeeklyWorkDigest>>();
const keyOf = (userId: string, y: number, w: number) => `${userId}:${y}:${w}`;

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Lazy-read + cache + in-flight-coalesced reader for the personal Weekly work
 * digest. Owner-scoped: the caller passes the authenticated user's id and we
 * only ever read that user's data, across every workspace they can access.
 *
 * `target` lets the UI page back to a prior ISO week; past weeks are generated
 * once and cached forever (the week is over, nothing more will happen), while
 * the active week uses a staleness TTL like the workspace narrative.
 */
export async function getOrGenerateWeeklyWorkDigest(
  db: PrismaClient,
  args: {
    userId: string;
    target?: { isoYear: number; isoWeek: number };
    force?: boolean;
    now?: Date;
    openai?: DigestOpenAIClient;
  },
): Promise<WeeklyWorkDigest> {
  const now = args.now ?? new Date();
  const currentYear = getISOWeekYear(now);
  const currentWeek = getISOWeek(now);
  const isoYear = args.target?.isoYear ?? currentYear;
  const isoWeek = args.target?.isoWeek ?? currentWeek;
  const isActiveWeek = isoYear === currentYear && isoWeek === currentWeek;

  const existing = await db.weeklyWorkDigest.findUnique({
    where: { userId_isoYear_isoWeek: { userId: args.userId, isoYear, isoWeek } },
  });

  if (existing) {
    const ageMs = now.getTime() - existing.generatedAt.getTime();
    if (args.force && isActiveWeek && ageMs < REGENERATE_COOLDOWN_MS) {
      throw new DigestRateLimitError(REGENERATE_COOLDOWN_MS - ageMs);
    }
    // Past weeks never go stale; the active week honours the TTL.
    const fresh = !isActiveWeek || ageMs < STALE_AFTER_MS;
    if (!args.force && fresh) {
      return {
        isoYear,
        isoWeek,
        narrative: existing.narrative,
        highlights: jsonStringArray(existing.highlights),
        angles: jsonStringArray(existing.angles),
        generatedAt: existing.generatedAt,
        cached: true,
      };
    }
  }

  const key = keyOf(args.userId, isoYear, isoWeek);
  if (!args.force) {
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const work = generateAndStore(db, {
    userId: args.userId,
    isoYear,
    isoWeek,
    now,
    openai: args.openai,
  }).finally(() => {
    inFlight.delete(key);
  });
  if (!args.force) inFlight.set(key, work);
  return work;
}

async function generateAndStore(
  db: PrismaClient,
  args: {
    userId: string;
    isoYear: number;
    isoWeek: number;
    now: Date;
    openai?: DigestOpenAIClient;
  },
): Promise<WeeklyWorkDigest> {
  // Resolve the user's accessible workspaces (direct + team membership; not
  // project-only guests) — same guard as the aggregated activity feed.
  const workspaces = await db.workspace.findMany({
    where: buildWorkspaceAccessWhere(args.userId),
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  const ref = setISOWeek(setISOWeekYear(args.now, args.isoYear), args.isoWeek);
  const weekStart = startOfISOWeek(ref);
  const weekEnd = endOfISOWeek(ref);

  const bundle = await gatherWeeklyWorkBundle(db, {
    userId: args.userId,
    workspaceIds,
    weekStart,
    weekEnd,
  });

  // Empty-week shortcut — no LLM call. Cached under the canned model flag so an
  // idle week doesn't re-trigger generation on every page load.
  if (bundle.totalSignals === 0) {
    return upsertAndReturn(db, {
      userId: args.userId,
      isoYear: args.isoYear,
      isoWeek: args.isoWeek,
      narrative:
        "A quiet week — no tracked activity, assigned tickets, or meetings recorded. Either it was a lighter week, or work happened outside Exponential. Nothing to turn into content yet.",
      highlights: [
        "No acted-on activity this week",
        "No assigned tickets moved",
        "No meetings attended",
      ],
      angles: [],
      model: "canned",
      tokensIn: null,
      tokensOut: null,
    });
  }

  const nonce = randomBytes(8).toString("hex");
  const result = await synthesizeDigest(bundle, { nonce, openai: args.openai });

  return upsertAndReturn(db, {
    userId: args.userId,
    isoYear: args.isoYear,
    isoWeek: args.isoWeek,
    narrative: result.narrative,
    highlights: result.highlights,
    angles: result.angles,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });
}

async function upsertAndReturn(
  db: PrismaClient,
  args: {
    userId: string;
    isoYear: number;
    isoWeek: number;
    narrative: string;
    highlights: string[];
    angles: string[];
    model: string;
    tokensIn: number | null;
    tokensOut: number | null;
  },
): Promise<WeeklyWorkDigest> {
  const row = await db.weeklyWorkDigest.upsert({
    where: {
      userId_isoYear_isoWeek: {
        userId: args.userId,
        isoYear: args.isoYear,
        isoWeek: args.isoWeek,
      },
    },
    create: {
      userId: args.userId,
      isoYear: args.isoYear,
      isoWeek: args.isoWeek,
      narrative: args.narrative,
      highlights: args.highlights,
      angles: args.angles,
      model: args.model,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
    },
    update: {
      narrative: args.narrative,
      highlights: args.highlights,
      angles: args.angles,
      model: args.model,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      generatedAt: new Date(),
    },
  });

  return {
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    narrative: row.narrative,
    highlights: jsonStringArray(row.highlights),
    angles: jsonStringArray(row.angles),
    generatedAt: row.generatedAt,
    cached: false,
  };
}

export { MODEL };
