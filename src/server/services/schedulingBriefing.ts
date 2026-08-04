import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * Bump on every change to SCHEDULING_SYSTEM_PROMPT or buildSchedulingPrompt,
 * including whitespace. Metrics are sliced by this, and a reused version
 * silently merges two different prompts' results.
 *
 * See docs/ZOE_DAILY_BRIEFING.md.
 */
export const SCHEDULING_PROMPT_VERSION = "zoe-scheduling-v1";

/**
 * A briefing is reusable for the rest of the calendar day as long as the input
 * it was generated from is unchanged. Suggestions are advice about a set of
 * actions and a calendar; if neither moved, regenerating produces the same
 * advice at real token cost.
 */
export interface SuggestionInputSnapshot {
  days: number;
  /** Sorted; ids + the fields the prompt actually reads. */
  overdue: Array<{
    id: string;
    name: string;
    dueDate: string | null;
    scheduledStart: string | null;
    projectName: string | null;
  }>;
  /** Sorted; only the busy intervals matter for scheduling. */
  calendar: Array<{ start: string; end: string }>;
  scheduled: Array<{ id: string; scheduledStart: string | null }>;
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toISOString();
}

/**
 * Google calendar times are `{ dateTime }` for timed events and `{ date }` for
 * all-day ones. Both matter to the snapshot: an all-day event still blocks a
 * day even though it has no time.
 */
type CalendarTime = { dateTime?: string; date?: string; timeZone?: string };

function calendarIso(t: CalendarTime | string | Date | null | undefined): string {
  if (!t) return "";
  if (typeof t === "string" || t instanceof Date) return iso(t) ?? "";
  return iso(t.dateTime ?? t.date) ?? "";
}

/**
 * Build a deterministic snapshot of everything the prompt sees. Deterministic
 * matters twice: it is the cache key, and it is the replayable input the
 * autoresearch loop scores candidate prompts against — so the ordering must not
 * depend on query order.
 */
export function buildInputSnapshot(args: {
  days: number;
  overdueActions: Array<{
    id: string;
    name: string;
    dueDate: Date | null;
    scheduledStart: Date | null;
    project?: { name: string } | null;
  }>;
  calendarEvents: Array<{
    start?: CalendarTime | string | Date | null;
    end?: CalendarTime | string | Date | null;
  }>;
  scheduledActions: Array<{ id: string; scheduledStart: Date | null }>;
}): SuggestionInputSnapshot {
  return {
    days: args.days,
    overdue: args.overdueActions
      .map((a) => ({
        id: a.id,
        name: a.name,
        dueDate: iso(a.dueDate),
        scheduledStart: iso(a.scheduledStart),
        projectName: a.project?.name ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    calendar: args.calendarEvents
      .map((e) => ({ start: calendarIso(e.start), end: calendarIso(e.end) }))
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
    scheduled: args.scheduledActions
      .map((a) => ({ id: a.id, scheduledStart: iso(a.scheduledStart) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function snapshotHash(snapshot: SuggestionInputSnapshot): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex")
    .slice(0, 16);
}

/** Midnight UTC for the @db.Date column, so one row per user per calendar day. */
export function briefingDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

interface StoredOutput {
  snapshotHash: string;
  suggestions: unknown[];
}

/**
 * Today's briefing for this user, if one was generated from an identical input.
 * Returns null when absent or stale, which is the signal to call the model.
 */
export async function findReusableBriefing(
  db: PrismaClient,
  args: {
    userId: string;
    workspaceId?: string | null;
    date: Date;
    hash: string;
  },
): Promise<{ id: string; suggestions: unknown[] } | null> {
  const existing = await db.dailyBriefing.findFirst({
    where: {
      userId: args.userId,
      date: args.date,
      promptVersion: SCHEDULING_PROMPT_VERSION,
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, outputStructured: true },
  });

  if (!existing?.outputStructured) return null;

  const stored = existing.outputStructured as unknown as StoredOutput;
  if (stored?.snapshotHash !== args.hash) return null;

  return { id: existing.id, suggestions: stored.suggestions ?? [] };
}

export async function persistBriefing(
  db: PrismaClient,
  args: {
    userId: string;
    workspaceId?: string | null;
    date: Date;
    modelId: string;
    snapshot: SuggestionInputSnapshot;
    hash: string;
    outputText: string;
    suggestions: unknown[];
    latencyMs?: number;
  },
): Promise<string | null> {
  try {
    const row = await db.dailyBriefing.create({
      data: {
        userId: args.userId,
        workspaceId: args.workspaceId ?? null,
        date: args.date,
        promptVersion: SCHEDULING_PROMPT_VERSION,
        modelId: args.modelId,
        inputSnapshot: args.snapshot as unknown as object,
        outputText: args.outputText,
        outputStructured: {
          snapshotHash: args.hash,
          suggestions: args.suggestions,
        } as unknown as object,
        latencyMs: args.latencyMs,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    // Persistence is telemetry, never the point of the request. A failure here
    // costs a cache entry, not the user's suggestions.
    console.error("[schedulingBriefing] failed to persist briefing:", error);
    return null;
  }
}

export const BRIEFING_INTERACTION_TYPES = [
  "viewed",
  "accepted",
  "dismissed",
  "refreshed",
  "thumbs_up",
  "thumbs_down",
] as const;

export type BriefingInteractionType = (typeof BRIEFING_INTERACTION_TYPES)[number];
