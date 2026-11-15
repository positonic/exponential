/**
 * What a workspace's plan lets its Assistant do: the one decision seam.
 *
 * `getEntitlements` reads the facts (plan, allowance, the month's hosted-key
 * spend, whether the workspace runs on its own key). `decideAssistantAccess`
 * is the pure rule that turns them into an answer. Every gate asks
 * `decideAssistantAccess`; nothing else reads plan or usage to decide.
 *
 * The rule, for a workspace with no working key of its own:
 *
 *   share of allowance used   chat                      a new agent run
 *   under 100%                allowed                   allowed
 *   100% up to 200%           allowed on the fast tier  refused (OVER_ALLOWANCE)
 *   200% or more              refused (HARD_CAP)        refused (HARD_CAP)
 *
 * It only ever restricts in `enforce` mode. In `meter` mode every turn is
 * allowed on its normal tier whatever the usage, and the warning level is
 * still worked out so the usage bar can show it. A workspace on its own
 * working key is never limited. An install that does not meter (`off`) has no
 * allowance at all.
 */
import type { PrismaClient } from "@prisma/client";

import { FREE_ALLOWANCE_MICROS, resolveBillingMode, type BillingEnv, type BillingMode } from "./config";
import { getPeriodUsage } from "./usage";

export type BillingPlan = "FREE" | "TEAM";

export interface Entitlements {
  mode: BillingMode;
  plan: BillingPlan;
  /** The month's assistant allowance, in micro-USD of model cost. Not applied when `mode` is `off`. */
  allowanceMicros: number;
  /** Hosted-key spend so far this calendar month (UTC). Turns on the workspace's own key are not in it. */
  usedMicros: number;
  /** The workspace runs its Assistant on its own Anthropic key, and the key works. */
  hasWorkingKey: boolean;
}

export type AssistantUseKind = "chat" | "agentRun";

export interface AssistantAccess {
  allow: boolean;
  /** Chat only: answer on the fast tier instead of the model the turn would normally get. */
  forceFastTier: boolean;
  /** Why the turn is restricted. Absent when it is not. */
  reason?: "OVER_ALLOWANCE" | "HARD_CAP";
  /** The highest warning threshold the month's usage has reached, in percent. */
  warnLevel?: 80 | 100;
}

const UNRESTRICTED: AssistantAccess = { allow: true, forceFastTier: false };

/** Usage as a fraction of the allowance: 1 is the whole allowance. */
function usedShare(entitlements: Pick<Entitlements, "allowanceMicros" | "usedMicros">): number {
  if (entitlements.allowanceMicros <= 0) return entitlements.usedMicros > 0 ? Number.POSITIVE_INFINITY : 0;
  return entitlements.usedMicros / entitlements.allowanceMicros;
}

/** Whole percent of the month's allowance used; above 100 once it is passed. */
export function usedPercent(entitlements: Pick<Entitlements, "allowanceMicros" | "usedMicros">): number {
  return Math.round(usedShare(entitlements) * 100);
}

export function decideAssistantAccess(entitlements: Entitlements, kind: AssistantUseKind): AssistantAccess {
  if (entitlements.mode === "off" || entitlements.hasWorkingKey) return UNRESTRICTED;

  const share = usedShare(entitlements);
  const warnLevel = share >= 1 ? 100 : share >= 0.8 ? 80 : undefined;
  const withinPlan: AssistantAccess = { ...UNRESTRICTED, ...(warnLevel ? { warnLevel } : {}) };

  if (entitlements.mode !== "enforce" || share < 1) return withinPlan;
  if (share >= 2) return { allow: false, forceFastTier: false, reason: "HARD_CAP", warnLevel: 100 };
  return kind === "chat"
    ? { allow: true, forceFastTier: true, reason: "OVER_ALLOWANCE", warnLevel: 100 }
    : { allow: false, forceFastTier: false, reason: "OVER_ALLOWANCE", warnLevel: 100 };
}

/**
 * A workspace's plan facts. One indexed read of the month's counter; on an
 * install that does not meter, no read at all.
 *
 * Every workspace is on Free with no key of its own until Team billing and
 * bring-your-own-key exist; they extend this function, not its callers.
 */
export async function getEntitlements(
  db: Pick<PrismaClient, "workspaceUsagePeriod">,
  workspaceId: string,
  options: { env?: BillingEnv; now?: Date } = {},
): Promise<Entitlements> {
  const mode = resolveBillingMode(options.env ?? process.env);
  const plan: BillingPlan = "FREE";
  if (mode === "off") return { mode, plan, allowanceMicros: 0, usedMicros: 0, hasWorkingKey: false };

  const usage = await getPeriodUsage(db, workspaceId, options.now);
  return {
    mode,
    plan,
    allowanceMicros: FREE_ALLOWANCE_MICROS,
    usedMicros: usage.usedMicros,
    hasWorkingKey: false,
  };
}
