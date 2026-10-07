/**
 * Jev as the turn decision layer (ADR-0065).
 *
 * TypeSafe's Jev is a "System One" model: it answers typed Choice/Score
 * questions against a state string with calibrated probabilities and a
 * confidence, in roughly 70-500 ms, and cannot produce free text. That makes
 * it the right tool for the one decision `pickModelTier` has to make before
 * every chat turn — "does this turn need the fast tier or the deep tier?" —
 * which today is a hand-written regex list.
 *
 * Design constraints:
 *   - Never on the critical path when it is not configured, slow, or down.
 *     No `TYPESAFE_API_KEY` → returns null instantly. Any error, timeout or
 *     malformed response → null. The caller falls back to the regexes.
 *   - Low confidence is a null too. TypeSafe's own docs set 0.5 as the floor
 *     for "genuine uncertainty"; below it the regexes decide.
 *   - Auth/billing failures from TypeSafe trip a short circuit breaker so a
 *     dead key costs one failed round-trip per cooldown, not one per turn.
 *   - Raw fetch, no SDK: one endpoint, one question shape, and the request
 *     must be abortable on a tight timeout.
 *
 * API: POST https://api.typesafe.ai/v1/systemone, bearer key, body
 * `{ model, state, questions: { id: { type: "choice", instructions,
 * criteria } } }`, response `{ model, answers: { id: { type, choice,
 * confidence, probabilities } }, usage }`.
 */

export type TurnTier = "fast" | "deep";

export interface TierDecision {
  tier: TurnTier;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  model: string;
}

interface MessageLike {
  role: string;
  content: string;
}

export interface TierDecisionInput {
  /** The latest user message (already trimmed by the caller). */
  message: string;
  /** Prior turns of the same conversation, oldest first. */
  priorTurns: MessageLike[];
}

export interface JevClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type TierDecider = (
  input: TierDecisionInput,
) => Promise<TierDecision | null>;

/** TypeSafe's documented floor for acting on a Choice without a fallback. */
export const JEV_MIN_CONFIDENCE = 0.5;

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest";
/**
 * Hard ceiling on what the decision may add to first-token latency. Jev's
 * published range is 70-500 ms; anything slower than this is worse than the
 * regexes, which are free.
 */
const DEFAULT_TIMEOUT_MS = 800;
/** How long a 401/402/403 from TypeSafe disables Jev for. */
const AUTH_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

/** State budget: Jev allows 32K tokens of state; we send far less on purpose. */
const MAX_PRIOR_TURNS = 6;
const MAX_CHARS_PER_PRIOR_TURN = 400;
const MAX_CHARS_CURRENT_MESSAGE = 4_000;

const TIER_QUESTION = {
  type: "choice" as const,
  instructions:
    "The user is talking to Zoe, a personal productivity assistant with tools " +
    "for projects, tasks, goals, calendar, meetings, Slack and the web. Decide " +
    "which tier of model should answer the LATEST user message, given the " +
    "recent conversation.",
  criteria: {
    fast: {
      covers:
        "Greetings, thanks, acknowledgements, yes/no replies, short factual " +
        "questions, and single straightforward lookups or actions the " +
        "assistant can complete with one or two tool calls: what's on my " +
        "calendar, list my projects, any unread mentions, mark X done, " +
        "create a task called Y, reschedule Z to Friday.",
      excludes: "Anything that needs planning, synthesis or writing.",
    },
    deep: {
      covers:
        "Planning, prioritising across many items, analysis, comparing " +
        "options, drafting or long-form writing, summarising several " +
        "sources, debugging, multi-step work that chains several tools, " +
        "ambiguous requests where a wrong answer is costly, or an explicit " +
        "ask to think hard.",
      excludes: "Simple lookups and one-shot actions.",
    },
  },
};

/**
 * `TYPESAFE_TIER_TIMEOUT_MS`, validated. An empty or non-numeric value would
 * otherwise become a 0 ms / NaN timer that fires at once and silently turns
 * Jev off on every turn; anything that is not a positive finite number
 * falls back to the default.
 */
export function readTimeoutMsFromEnv(
  raw: string | undefined = process.env.TYPESAFE_TIER_TIMEOUT_MS,
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `⚠️ [jevDecision] Ignoring invalid TYPESAFE_TIER_TIMEOUT_MS="${raw}"; using ${DEFAULT_TIMEOUT_MS}ms`,
    );
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

let authFailureUntil = 0;

/** Test hook: clear the auth-failure circuit breaker. */
export function resetJevCircuitBreaker(): void {
  authFailureUntil = 0;
}

export function buildJevState(input: TierDecisionInput): string {
  const prior = input.priorTurns
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_PRIOR_TURNS)
    .map((m) => {
      const who = m.role === "user" ? "User" : "Zoe";
      const text = m.content.length > MAX_CHARS_PER_PRIOR_TURN
        ? `${m.content.slice(0, MAX_CHARS_PER_PRIOR_TURN)}…`
        : m.content;
      return `${who}: ${text}`;
    });
  const current = input.message.length > MAX_CHARS_CURRENT_MESSAGE
    ? `${input.message.slice(0, MAX_CHARS_CURRENT_MESSAGE)}…`
    : input.message;
  const history = prior.length > 0
    ? `Recent conversation:\n${prior.join("\n")}\n\n`
    : "";
  return `${history}LATEST user message:\n${current}`;
}

interface JevChoiceAnswer {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

interface JevResponse {
  model?: string;
  answers?: Record<string, JevChoiceAnswer>;
}

function isTier(value: unknown): value is TurnTier {
  return value === "fast" || value === "deep";
}

/**
 * Ask Jev which tier the turn needs. Resolves to null whenever the caller
 * should fall back to its own heuristics; never throws.
 */
export async function decideTierWithJev(
  input: TierDecisionInput,
  options: JevClientOptions = {},
): Promise<TierDecision | null> {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;

  const now = options.now ?? Date.now;
  if (now() < authFailureUntil) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? process.env.TYPESAFE_API_URL ?? DEFAULT_BASE_URL;
  const model = options.model ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? readTimeoutMsFromEnv();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = now();

  try {
    const response = await fetchImpl(`${baseUrl}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        state: buildJevState(input),
        questions: { tier: TIER_QUESTION },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 402 || response.status === 403) {
        authFailureUntil = now() + AUTH_FAILURE_COOLDOWN_MS;
        console.error(
          `❌ [jevDecision] TypeSafe returned ${response.status}; disabling Jev for ${AUTH_FAILURE_COOLDOWN_MS / 60000} min`,
        );
      } else {
        console.warn(`⚠️ [jevDecision] TypeSafe returned ${response.status}; falling back to heuristics`);
      }
      return null;
    }

    const body = (await response.json()) as JevResponse;
    const answer = body.answers?.tier;
    if (!answer || !isTier(answer.choice) || typeof answer.confidence !== "number") {
      console.warn("⚠️ [jevDecision] Malformed Jev response; falling back to heuristics");
      return null;
    }
    const latencyMs = now() - startedAt;
    if (answer.confidence < JEV_MIN_CONFIDENCE) {
      console.log(
        `🤷 [jevDecision] Low confidence (${answer.confidence.toFixed(2)}) for "${answer.choice}" in ${latencyMs}ms; falling back to heuristics`,
      );
      return null;
    }
    return {
      tier: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities ?? {},
      latencyMs,
      model: body.model ?? model,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    if (aborted) {
      console.warn(`⚠️ [jevDecision] Timed out after ${timeoutMs}ms; falling back to heuristics`);
    } else {
      console.warn("⚠️ [jevDecision] Request failed; falling back to heuristics", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
