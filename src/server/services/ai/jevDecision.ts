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
 * API: POST <base>/v1/systemone, bearer key, body `{ model, state,
 * questions: { id: { type: "choice", instructions, criteria } } }`,
 * response `{ model, answers: { id: { type, choice, confidence,
 * probabilities } }, usage }`.
 *
 * Two providers serve that exact shape, chosen by `resolveJevProvider`:
 *   - OpenRouter: `https://openrouter.ai/api/v1/systemone`, "compatible with
 *     the TypeSafe SDKs", bare ids like `jev-latest` mapped onto the
 *     `typesafe/` namespace, billed to the OpenRouter account. Preferred when
 *     `OPENROUTER_API_KEY` is set — one account, one bill, and it is the
 *     same key the Mastra-side OpenRouter work (ADR-0065 §3) will use.
 *   - TypeSafe direct: `https://api.typesafe.ai/v1/systemone` with
 *     `TYPESAFE_API_KEY`. Used when only that key is set, or when
 *     `JEV_PROVIDER=typesafe` forces it.
 */

export type TurnTier = "fast" | "deep";

export interface TierDecision {
  tier: TurnTier;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  model: string;
  provider: JevProviderName;
  /** OpenRouter reports the request cost in USD; TypeSafe direct does not. */
  costUsd?: number;
}

export type JevProviderName = "openrouter" | "typesafe";

export interface JevProvider {
  name: JevProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface JevEnv {
  OPENROUTER_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
  TYPESAFE_API_URL?: string;
  OPENROUTER_API_URL?: string;
  JEV_PROVIDER?: string;
  JEV_MODEL?: string;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";
const TYPESAFE_BASE_URL = "https://api.typesafe.ai";

/**
 * Pick which System One endpoint to call from the environment. Null means
 * Jev is not configured at all and the caller must use its own heuristics.
 *
 * Precedence: `JEV_PROVIDER` if set and its key exists; otherwise OpenRouter
 * when `OPENROUTER_API_KEY` is set; otherwise TypeSafe direct when
 * `TYPESAFE_API_KEY` is set. Exported for tests.
 */
export function resolveJevProvider(
  env: JevEnv = process.env as JevEnv,
): JevProvider | null {
  const model = env.JEV_MODEL?.trim() || DEFAULT_MODEL;
  const openrouter: JevProvider | null = env.OPENROUTER_API_KEY
    ? {
        name: "openrouter",
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_API_URL ?? OPENROUTER_BASE_URL,
        model,
      }
    : null;
  const typesafe: JevProvider | null = env.TYPESAFE_API_KEY
    ? {
        name: "typesafe",
        apiKey: env.TYPESAFE_API_KEY,
        baseUrl: env.TYPESAFE_API_URL ?? TYPESAFE_BASE_URL,
        model,
      }
    : null;

  const forced = env.JEV_PROVIDER?.trim().toLowerCase();
  if (forced === "openrouter") return openrouter;
  if (forced === "typesafe") return typesafe;
  if (forced) {
    console.warn(`⚠️ [jevDecision] Unknown JEV_PROVIDER="${env.JEV_PROVIDER}"; using key-based default`);
  }
  return openrouter ?? typesafe;
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
  /** Full provider override (tests, or callers that already resolved one). */
  provider?: JevProvider | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type TierDecider = (
  input: TierDecisionInput,
) => Promise<TierDecision | null>;

/** TypeSafe's documented floor for acting on a Choice without a fallback. */
export const JEV_MIN_CONFIDENCE = 0.5;

/**
 * Bare id works on both providers: TypeSafe's default alias, and OpenRouter
 * maps bare System One ids onto the `typesafe/` namespace.
 */
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
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
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
  const provider =
    options.provider === undefined ? resolveJevProvider() : options.provider;
  if (!provider) return null;

  const now = options.now ?? Date.now;
  if (now() < authFailureUntil) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? readTimeoutMsFromEnv();
  const label = provider.name === "openrouter" ? "OpenRouter" : "TypeSafe";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = now();

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    };
    if (provider.name === "openrouter") {
      // Optional app attribution OpenRouter shows in its activity view.
      headers["X-Title"] = "Exponential";
    }
    const response = await fetchImpl(`${provider.baseUrl}/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model,
        state: buildJevState(input),
        questions: { tier: TIER_QUESTION },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 402 || response.status === 403) {
        authFailureUntil = now() + AUTH_FAILURE_COOLDOWN_MS;
        console.error(
          `❌ [jevDecision] ${label} returned ${response.status}; disabling Jev for ${AUTH_FAILURE_COOLDOWN_MS / 60000} min`,
        );
      } else {
        console.warn(`⚠️ [jevDecision] ${label} returned ${response.status}; falling back to heuristics`);
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
      model: body.model ?? provider.model,
      provider: provider.name,
      costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : undefined,
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
