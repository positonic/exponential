/**
 * The usage ledger: what each Assistant turn cost, per workspace.
 *
 * `recordUsage` appends a `UsageEvent` and adds its cost to the workspace's
 * counter for the calendar month (`WorkspaceUsagePeriod`), in one transaction.
 * A turn that ran on the workspace's own Anthropic key is recorded but never
 * added to the counter.
 *
 * Callers do not wait on it for anything the user sees, and it never throws:
 * a metering failure must not fail or slow an Assistant turn. On an install
 * that does not meter (`BILLING_MODE` unset or `off`) it does nothing at all.
 */
import type { PrismaClient } from "@prisma/client";

import { priceTokenBreakdown, toCostMicros, turnTokenBreakdown } from "~/server/services/ai/cost";
import { findPersonalWorkspaceId } from "~/server/services/assistant/personalWorkspace";
import { isMeteringOn, resolveBillingMode, type BillingEnv } from "./config";
import { reportBackgroundFailure, runAfterResponse } from "~/server/utils/runAfterResponse";

export const USAGE_SOURCES = ["CHAT", "AGENT_RUN", "VOICE", "DIRECT"] as const;

export type UsageSource = (typeof USAGE_SOURCES)[number];

/** The slice of Prisma the ledger touches. */
export type UsageDb = Pick<PrismaClient, "$transaction" | "usageEvent" | "workspaceUsagePeriod">;

export interface UsageRecord {
  workspaceId: string;
  source: UsageSource;
  modelId?: string | null;
  /** USD × 1e6. */
  costMicros: number;
  onOwnKey?: boolean;
  /** AiInteractionHistory.id or AgentRun.id. */
  refId?: string | null;
}

export interface MeteringOptions {
  /** Defaults to `process.env`. */
  env?: BillingEnv;
  /** Injectable clock for tests. */
  now?: Date;
}

/** First instant of the calendar month containing `at`, UTC. */
export function usagePeriodStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** First instant of the month after the one containing `at`, UTC: when the counter starts again. */
export function usagePeriodEnd(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

/** Returns true when the event was written. */
export async function recordUsage(db: UsageDb, record: UsageRecord, options: MeteringOptions = {}): Promise<boolean> {
  if (!isMeteringOn(resolveBillingMode(options.env ?? process.env))) return false;
  if (!Number.isFinite(record.costMicros) || record.costMicros < 0) {
    console.error("[billing] Dropped a usage record with an invalid cost", {
      workspaceId: record.workspaceId,
      source: record.source,
      costMicros: record.costMicros,
    });
    return false;
  }

  const costMicros = Math.round(record.costMicros);
  const onOwnKey = record.onOwnKey ?? false;
  const periodStart = usagePeriodStart(options.now ?? new Date());
  try {
    await db.$transaction([
      db.usageEvent.create({
        data: {
          workspaceId: record.workspaceId,
          source: record.source,
          modelId: record.modelId ?? null,
          costMicros,
          onOwnKey,
          refId: record.refId ?? null,
        },
      }),
      ...(onOwnKey
        ? []
        : [
            db.workspaceUsagePeriod.upsert({
              where: { workspaceId_periodStart: { workspaceId: record.workspaceId, periodStart } },
              create: { workspaceId: record.workspaceId, periodStart, costMicros },
              update: { costMicros: { increment: costMicros } },
            }),
          ]),
    ]);
    return true;
  } catch (error) {
    console.error("[billing] Failed to record usage", {
      workspaceId: record.workspaceId,
      source: record.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export interface TurnUsage {
  workspaceId: string;
  source: UsageSource;
  /** The model that answered. A turn whose model has no price is not recorded. */
  modelId: string | undefined;
  /** The turn's summed usage, as Mastra reports it. */
  turnUsage: unknown;
  /** Each model step's usage, when the caller saw them: prices cache traffic exactly. */
  stepUsages?: readonly unknown[];
  onOwnKey?: boolean;
  refId?: string | null;
}

/**
 * Price one Assistant turn from the usage Mastra reported and record it.
 * Returns the cost recorded, or undefined when nothing was written (metering
 * off, no usage reported, or a model the price table does not know).
 */
export async function recordTurnUsage(
  db: UsageDb,
  turn: TurnUsage,
  options: MeteringOptions = {},
): Promise<number | undefined> {
  if (!isMeteringOn(resolveBillingMode(options.env ?? process.env))) return undefined;

  const tokens = turnTokenBreakdown(turn.turnUsage, turn.stepUsages);
  if (!tokens) return undefined;

  const costUsd = priceTokenBreakdown(turn.modelId, tokens);
  if (costUsd === undefined) {
    reportUnpricedModel(turn);
    return undefined;
  }

  const costMicros = toCostMicros(costUsd);
  const recorded = await recordUsage(
    db,
    {
      workspaceId: turn.workspaceId,
      source: turn.source,
      modelId: turn.modelId,
      costMicros,
      onOwnKey: turn.onOwnKey,
      refId: turn.refId,
    },
    options,
  );
  return recorded ? costMicros : undefined;
}

/**
 * A turn the ledger could not price is spend nobody is counting, so it files
 * a bug rather than only logging. Loaded lazily: the reporter pulls in the
 * database client and Sentry, which the ledger itself never needs.
 */
function reportUnpricedModel(turn: TurnUsage): void {
  const modelId = turn.modelId ?? "unknown";
  console.error(`[billing] No price for model "${modelId}"; the ${turn.source} turn was not metered`);
  // After the response, so the lazy import + report can't be frozen mid-way.
  runAfterResponse(() =>
    reportBackgroundFailure(new Error(`Usage metering has no price for model "${modelId}"`), "billing-metering", {
      modelId,
      source: turn.source,
    }),
  );
}

/**
 * The workspace an Assistant turn is metered to: the one it ran in, or, for a
 * turn with no workspace (the global chat drawer, `/agent`, a direct call),
 * the person's Personal workspace, which every onboarded person has.
 *
 * `workspaceId` must already be verified as one the person belongs to; never
 * pass a value straight from a request body. Null on an install that does
 * not meter (without touching the database), and for a person with no
 * Personal workspace yet.
 */
export async function resolveMeteredWorkspaceId(
  db: Parameters<typeof findPersonalWorkspaceId>[0],
  turn: { workspaceId?: string | null; userId: string },
  options: Pick<MeteringOptions, "env"> = {},
): Promise<string | null> {
  if (!isMeteringOn(resolveBillingMode(options.env ?? process.env))) return null;
  if (turn.workspaceId) return turn.workspaceId;
  try {
    return await findPersonalWorkspaceId(db, turn.userId);
  } catch (error) {
    console.error("[billing] Could not resolve the Personal workspace to meter to", {
      userId: turn.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** The workspace's hosted-key spend so far in the calendar month containing `now`. */
export async function getPeriodUsage(
  db: Pick<PrismaClient, "workspaceUsagePeriod">,
  workspaceId: string,
  now: Date = new Date(),
): Promise<{ periodStart: Date; periodEnd: Date; usedMicros: number }> {
  const periodStart = usagePeriodStart(now);
  const period = await db.workspaceUsagePeriod.findUnique({
    where: { workspaceId_periodStart: { workspaceId, periodStart } },
    select: { costMicros: true },
  });
  // The counter is a BigInt column; micro-USD stay far inside a double's exact range.
  return { periodStart, periodEnd: usagePeriodEnd(now), usedMicros: Number(period?.costMicros ?? 0) };
}
