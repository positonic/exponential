import type { PrismaClient } from "@prisma/client";

/**
 * Tiered model routing — picks the actual Mastra agent ID to invoke for a
 * chat turn. Maps the public agent IDs (`zoeAgent`, `assistantAgent`) to
 * either themselves (Sonnet 4.5) or their Haiku 4.5 variant
 * (`zoeAgentHaiku`, `assistantAgentHaiku`) depending on heuristics applied
 * to the user message and prior turns of the same conversation.
 *
 * Goals:
 *   - Sub-2s first-token latency on trivial turns by serving them from
 *     Haiku 4.5 instead of Sonnet 4.5.
 *   - ~12× cheaper per-token on simple turns.
 *   - No quality regression on hard turns — they stay on Sonnet.
 *
 * Order of decisions:
 *   1. Other agents (e.g. projectManagerAgent) pass through unchanged — they
 *      have no Haiku variant.
 *   2. If the client explicitly requested the Haiku variant, respect it.
 *   3. Conversation stickiness: stay on whichever tier the thread has used
 *      so far. Anthropic prompt caches are model-scoped, so flipping tiers
 *      mid-conversation forces a cold cache and undoes the win. If the prior
 *      Haiku turn errored, escalate to Sonnet for this turn.
 *   4. Heuristics on the latest user message:
 *        - Force Sonnet on explicit opt-in (`@think`, `@zoe-think`) or long
 *          messages that contain hard-thinking verbs (plan/design/analyze/...).
 *        - Fast-path to Haiku for greetings, short messages without
 *          @mentions, and obvious single-tool lookups.
 *   5. Fallback: Haiku (cheaper + faster). Stickiness will escalate if the
 *      next turn shows the model couldn't handle the work.
 *
 * Pure-ish: only DB read is the stickiness lookup against
 * aiInteractionHistory.
 */

const HAIKU_VARIANT: Record<string, string> = {
  zoeAgent: "zoeAgentHaiku",
  assistantAgent: "assistantAgentHaiku",
};

const HAIKU_VARIANT_IDS = new Set(Object.values(HAIKU_VARIANT));

interface MessageLike {
  role: string;
  content: string;
}

export interface PickModelTierInput {
  agentId: string;
  conversationId: string | undefined;
  userId: string;
  finalMessages: MessageLike[];
  db: PrismaClient;
}

export interface PickModelTierResult {
  agentId: string;
  reason: string;
}

const FORCE_SONNET_OPT_IN = /@(zoe-)?think\b/i;
const HARD_VERBS =
  /\b(plan|design|analyze|analyse|draft|write|architect|strategize|strategise|outline|brainstorm)\b/i;
const GREETING =
  /^(hi+|hello+|hey+|yo+|sup|thanks(?: you)?|thank you|ok(?:ay)?|cool|nice|got it|great|yes|no|sure|gm|good morning|good night|gn|bye|cya)[\s.!?]*$/i;
const OBVIOUS_LOOKUPS = [
  /^what'?s on my calendar/i,
  /^do i have (any )?meetings?/i,
  /^list (my )?projects?/i,
  /^show (my )?projects?/i,
  /^what projects/i,
  /^any unreads?/i,
  /^any mentions?/i,
  /^who tagged me/i,
  /^what'?s in slack/i,
];
const SHORT_MSG_CHARS = 80;
const LONG_HARD_MSG_CHARS = 200;

export async function pickModelTier(
  input: PickModelTierInput,
): Promise<PickModelTierResult> {
  const { agentId, conversationId, userId, finalMessages, db } = input;

  // Agents without a Haiku variant pass through unchanged.
  const haikuId = HAIKU_VARIANT[agentId];
  if (!haikuId) {
    return { agentId, reason: "no-haiku-variant" };
  }

  const sonnetId = agentId;

  // Conversation stickiness — once a thread is on a tier, stay on it so
  // we don't ping-pong caches between models. Escalate to Sonnet if the
  // previous Haiku turn errored.
  if (conversationId) {
    const prior = await db.aiInteractionHistory.findFirst({
      where: { conversationId, systemUserId: userId },
      orderBy: { createdAt: "desc" },
      select: { agentId: true, hadError: true },
    });
    if (prior?.agentId === haikuId) {
      if (prior.hadError) {
        return { agentId: sonnetId, reason: "sticky-escalate-after-error" };
      }
      return { agentId: haikuId, reason: "sticky-haiku" };
    }
    if (prior?.agentId === sonnetId) {
      return { agentId: sonnetId, reason: "sticky-sonnet" };
    }
  }

  const lastUserMsg =
    [...finalMessages].reverse().find((m) => m.role === "user")?.content ?? "";
  const trimmed = lastUserMsg.trim();

  // Force Sonnet for explicit opt-in.
  if (FORCE_SONNET_OPT_IN.test(trimmed)) {
    return { agentId: sonnetId, reason: "force-sonnet-opt-in" };
  }

  // Force Sonnet for long messages that contain hard-thinking verbs.
  if (trimmed.length > LONG_HARD_MSG_CHARS && HARD_VERBS.test(trimmed)) {
    return { agentId: sonnetId, reason: "force-sonnet-hard-prompt" };
  }

  // Fast-path to Haiku for greetings.
  if (GREETING.test(trimmed)) {
    return { agentId: haikuId, reason: "haiku-greeting" };
  }

  // Fast-path to Haiku for short messages without @mentions.
  const hasMention = /@\w/.test(trimmed);
  if (trimmed.length < SHORT_MSG_CHARS && !hasMention) {
    return { agentId: haikuId, reason: "haiku-short-no-mention" };
  }

  // Fast-path to Haiku for obvious single-tool lookups.
  if (OBVIOUS_LOOKUPS.some((p) => p.test(trimmed))) {
    return { agentId: haikuId, reason: "haiku-obvious-lookup" };
  }

  // Fallback: Haiku. Stickiness will escalate next turn if this turn errors.
  return { agentId: haikuId, reason: "haiku-fallback" };
}

export function isHaikuTier(agentId: string): boolean {
  return HAIKU_VARIANT_IDS.has(agentId);
}

export function sonnetVariantOf(agentId: string): string | undefined {
  for (const [sonnet, haiku] of Object.entries(HAIKU_VARIANT)) {
    if (haiku === agentId) return sonnet;
  }
  return undefined;
}
