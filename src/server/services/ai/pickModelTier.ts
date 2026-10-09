import type { PrismaClient } from "@prisma/client";
import { decideTierWithJev, type TierDecider, type ToolsetId } from "./jevDecision";

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
 *   4. Explicit opt-in (`@think`, `@zoe-think`) forces Sonnet. The user
 *      asked; no classifier overrides that.
 *   5. Jev (ADR-0065): when a Jev provider is configured (`OPENROUTER_API_KEY`
 *      via OpenRouter's System One endpoint, or `TYPESAFE_API_KEY` direct),
 *      ask Jev whether the turn is `fast` or `deep`. It answers in ~70-500 ms
 *      with a calibrated confidence. Acted on at confidence ≥ 0.5; otherwise,
 *      or on any timeout/error, fall through to the regexes below.
 *   6. Regex heuristics on the latest user message:
 *        - Force Sonnet on long messages that contain hard-thinking verbs
 *          (plan/design/analyze/...).
 *        - Fast-path to Haiku for greetings, short messages without
 *          @mentions, and obvious single-tool lookups.
 *   7. Fallback: Haiku (cheaper + faster). Stickiness will escalate if the
 *      next turn shows the model couldn't handle the work.
 *
 * Pure-ish: only DB read is the stickiness lookup against
 * aiInteractionHistory; the only network call is Jev, and it is optional.
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
  /**
   * Prior turns of the conversation, oldest first, for the decision layer.
   * The route sends Mastra only the latest user message (thread memory holds
   * the rest), so `finalMessages` carries no history — the caller must pass
   * the client-supplied transcript here or Jev decides "do the second one"
   * blind. Defaults to whatever precedes the last user message in
   * `finalMessages`.
   */
  priorTurns?: MessageLike[];
  db: PrismaClient;
  /**
   * Decision-layer override. Defaults to Jev (`decideTierWithJev`), which
   * is a no-op without `TYPESAFE_API_KEY`. Pass `null` to disable, or a
   * stub in tests.
   */
  decideTier?: TierDecider | null;
}

export interface PickModelTierResult {
  agentId: string;
  reason: string;
  /** Present when Jev made the call; for the route's log line and evals. */
  decision?: {
    confidence: number;
    latencyMs: number;
    model: string;
    provider: "openrouter" | "typesafe";
    costUsd?: number;
  };
  /**
   * Toolsets the turn needs beyond CORE, from the same Jev request (ticket
   * 674). Set whenever Jev answered, including when its tier answer was
   * too unsure to route on; undefined when Jev did not run (stickiness,
   * `@think`, no key, error) or its toolset answers were unusable. The
   * route forwards it to Mastra as the `toolsets` RequestContext entry.
   */
  toolsets?: ToolsetId[];
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
  const decideTier =
    input.decideTier === undefined ? decideTierWithJev : input.decideTier;

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

  // Jev decision layer. Null means "not configured / unavailable" and hands
  // the decision to the regexes below; a decision with `tier: null` means
  // "answered, but unsure of the tier" — the regexes pick the tier and the
  // toolset selection still rides along.
  let toolsets: ToolsetId[] | undefined;
  if (decideTier) {
    const lastUserIndex = finalMessages.lastIndexOf(
      [...finalMessages].reverse().find((m) => m.role === "user")!,
    );
    const decision = await decideTier({
      message: trimmed,
      priorTurns:
        input.priorTurns ?? finalMessages.slice(0, Math.max(0, lastUserIndex)),
    });
    toolsets = decision?.toolsets;
    if (decision?.tier) {
      return {
        agentId: decision.tier === "deep" ? sonnetId : haikuId,
        reason: decision.tier === "deep" ? "jev-deep" : "jev-fast",
        decision: {
          confidence: decision.confidence,
          latencyMs: decision.latencyMs,
          model: decision.model,
          provider: decision.provider,
          costUsd: decision.costUsd,
        },
        ...(toolsets ? { toolsets } : {}),
      };
    }
  }

  const regexResult = pickTierFromHeuristics(trimmed, sonnetId, haikuId);
  return toolsets ? { ...regexResult, toolsets } : regexResult;
}

/** The pre-Jev regex rules, unchanged. Used when Jev is absent or unsure. */
function pickTierFromHeuristics(
  trimmed: string,
  sonnetId: string,
  haikuId: string,
): PickModelTierResult {
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
