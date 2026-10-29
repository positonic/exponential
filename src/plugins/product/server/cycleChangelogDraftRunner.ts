import type { PrismaClient, Prisma } from "@prisma/client";
import { buildCycleChangelog } from "./cycleChangelog";
import { writeChangelogDraft, type DraftClient } from "./cycleChangelogDraft";
import { loadChangelogInputs } from "./cycleChangelogLoader";

/**
 * Generate a cycle's written change log and store it. Used by the "Draft with
 * AI" button and by the cron that drafts each cycle once it ends.
 *
 * Access is NOT enforced here — the caller resolves workspace access first.
 */

export type DraftRunResult =
  | { outcome: "drafted"; model: string; tokensIn: number; tokensOut: number }
  /** A person has edited the stored draft; regenerating needs `overwriteEdited`. */
  | { outcome: "skipped_edited" }
  /** Nothing shipped in the cycle, so there is nothing to write about. */
  | { outcome: "skipped_empty" };

export async function draftCycleChangelog(
  db: PrismaClient,
  args: {
    cycleId: string;
    userId?: string;
    overwriteEdited?: boolean;
    client?: DraftClient;
  },
): Promise<DraftRunResult> {
  const cycle = await db.list.findUniqueOrThrow({
    where: { id: args.cycleId },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      productId: true,
      startDate: true,
      endDate: true,
      cycleGoal: true,
      changelogDraft: { select: { source: true } },
    },
  });
  if (cycle.changelogDraft?.source === "edited" && !args.overwriteEdited) {
    return { outcome: "skipped_edited" };
  }
  if (!cycle.startDate || !cycle.endDate) return { outcome: "skipped_empty" };

  const window = {
    id: cycle.id,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
  };
  const inputs = (
    await loadChangelogInputs(db, {
      workspaceId: cycle.workspaceId,
      productId: cycle.productId,
      cycles: [window],
      withBodies: true,
    })
  ).get(cycle.id) ?? { tickets: [], pullRequests: [] };

  // Unfolded: the model merges the lone PRs into themes itself.
  const changelog = buildCycleChangelog({ ...inputs, foldSmallChanges: false });
  if (changelog.sections.length === 0) return { outcome: "skipped_empty" };

  const draft = await writeChangelogDraft(
    {
      cycleName: cycle.name,
      cycleGoal: cycle.cycleGoal,
      changelog,
      tickets: inputs.tickets,
    },
    {
      client: args.client,
      log: { db, workspaceId: cycle.workspaceId, userId: args.userId },
    },
  );

  const data = {
    content: draft.content as unknown as Prisma.InputJsonValue,
    source: "generated",
    model: draft.model,
    tokensIn: draft.tokensIn,
    tokensOut: draft.tokensOut,
    generatedAt: new Date(),
    updatedById: args.userId ?? null,
  };
  await db.cycleChangelogDraft.upsert({
    where: { cycleId: cycle.id },
    create: { cycleId: cycle.id, ...data },
    update: data,
  });

  return {
    outcome: "drafted",
    model: draft.model,
    tokensIn: draft.tokensIn,
    tokensOut: draft.tokensOut,
  };
}

/** How long after a cycle ends the cron still drafts it. */
const DRAFT_WINDOW_DAYS = 14;
/** Each draft is one model call; cap a single sweep. */
const MAX_DRAFTS_PER_SWEEP = 2;
/** Cycles looked at per sweep — empty ones are skipped without a model call. */
const MAX_CANDIDATES_PER_SWEEP = 25;

/**
 * Cron sweep: draft every cycle that ended in the last two weeks and has no
 * draft yet. A cycle where nothing shipped stores nothing and is looked at
 * again next sweep, which costs a query, not a model call.
 */
export async function runDueChangelogDrafts(
  db: PrismaClient,
  now: Date,
): Promise<{ cycleId: string; outcome: string; error?: string }[]> {
  const due = await db.list.findMany({
    where: {
      listType: "SPRINT",
      status: { in: ["ACTIVE", "COMPLETED"] },
      endDate: {
        lt: now,
        gte: new Date(now.getTime() - DRAFT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      },
      startDate: { not: null },
      changelogDraft: { is: null },
    },
    orderBy: { endDate: "asc" },
    take: MAX_CANDIDATES_PER_SWEEP,
    select: { id: true },
  });

  const results: { cycleId: string; outcome: string; error?: string }[] = [];
  let modelCalls = 0;
  for (const { id } of due) {
    if (modelCalls >= MAX_DRAFTS_PER_SWEEP) break;
    try {
      const result = await draftCycleChangelog(db, { cycleId: id });
      results.push({ cycleId: id, outcome: result.outcome });
      if (result.outcome === "drafted") modelCalls++;
    } catch (error) {
      modelCalls++;
      results.push({
        cycleId: id,
        outcome: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
