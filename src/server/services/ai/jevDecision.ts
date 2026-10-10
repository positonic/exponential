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

/**
 * Capability groups the Mastra agents load on demand (ticket 674). A contract
 * with mastra's `src/mastra/agents/toolsets.ts` (TOOLSET_IDS there); unknown
 * ids are ignored on that side, so either repo can ship first.
 */
export const TOOLSET_IDS = [
  "planning",
  "tickets",
  "pages",
  "notion",
  "calendar",
  "crm",
  "email",
  "whatsapp",
  "goals",
  "slack",
  "meetings",
  "decisions",
  "web",
] as const;
export type ToolsetId = (typeof TOOLSET_IDS)[number];

/**
 * Noul probability at or above which a toolset is loaded. Deliberately below
 * 0.5: TypeSafe's guidance is to lower the threshold when missing a true yes
 * is the expensive mistake, and a turn missing the tool it needs fails
 * outright, while an extra toolset only costs some schema tokens.
 */
export const TOOLSET_SELECT_THRESHOLD = 0.3;

export interface TierDecision {
  /**
   * The routed tier, or null when Jev answered but below JEV_MIN_CONFIDENCE.
   * The caller then falls back to its heuristics for the tier but can still
   * use `toolsets`, which are independent questions.
   */
  tier: TurnTier | null;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  model: string;
  provider: JevProviderName;
  /** OpenRouter reports the request cost in USD; TypeSafe direct does not. */
  costUsd?: number;
  /**
   * Toolsets this turn needs beyond CORE (may be empty). Undefined when any
   * toolset answer was missing or malformed: a partial selection is not
   * trusted, and mastra treats "no selection" as its own safe default.
   */
  toolsets?: ToolsetId[];
  /** Raw per-toolset Noul probabilities, for logging and threshold tuning. */
  toolsetProbabilities?: Partial<Record<ToolsetId, number>>;
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

/** What each toolset is for, phrased for the per-toolset Noul question. */
const TOOLSET_DESCRIPTIONS: Record<ToolsetId, string> = {
  planning:
    "project administration and triage: creating, renaming, archiving or deleting projects, changing project status, setting up a workspace structure, reviewing overdue work, deferring or rescheduling several actions",
  tickets:
    "the product pipeline: products, tickets, cycles, ticket dependencies, importing tickets from Notion, or ideating features",
  pages: "writing or editing a Knowledge Page (a long-form document inside the app)",
  notion: "searching, reading, querying or writing the user's Notion pages and databases",
  calendar:
    "calendar work beyond today's and upcoming events: events in a specific date range, finding free time, creating a calendar event, or checking the calendar connection",
  crm: "contacts and organisations in the CRM: finding, creating or updating them, or logging an interaction",
  email: "the user's email: reading, searching, sending or replying",
  whatsapp: "the user's WhatsApp chats: listing, reading or searching them",
  goals:
    "goals and OKRs: objectives, key results, check-ins, OKR stats, or linking projects to goals",
  slack: "Slack: sending or editing messages, reading channels or threads, searching, mentions or unreads",
  meetings: "meeting recordings: transcripts, what was said or decided in a meeting, or meeting insights",
  decisions: "the decision log: recording, updating or listing decisions",
  web: "looking something up on the public web or reading a web page",
};

function toolsetQuestion(id: ToolsetId) {
  return {
    type: "noul" as const,
    instructions:
      "The user is talking to Zoe, a personal productivity assistant. Will " +
      "answering the LATEST user message, given the recent conversation, " +
      `need tools for ${TOOLSET_DESCRIPTIONS[id]}?`,
    criteria: {
      true: "Zoe would plausibly need to use these tools to answer or act on the latest message.",
      false:
        "These tools are not needed: the message is about something else, or is a greeting, thanks or acknowledgement.",
    },
  };
}

const TOOLSET_QUESTIONS = Object.fromEntries(
  TOOLSET_IDS.map((id) => [`toolset_${id}`, toolsetQuestion(id)]),
);

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

interface JevAnswer {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  /** Noul answers: probability that the proposition holds. */
  noul?: number;
}

interface JevResponse {
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
}

function isTier(value: unknown): value is TurnTier {
  return value === "fast" || value === "deep";
}

/**
 * Read the per-toolset Noul answers. All-or-nothing: if any is missing or
 * not a probability, return undefined rather than a partial selection.
 */
export function readToolsetAnswers(
  answers: Record<string, JevAnswer> | undefined,
): { toolsets: ToolsetId[]; probabilities: Partial<Record<ToolsetId, number>> } | undefined {
  const probabilities: Partial<Record<ToolsetId, number>> = {};
  for (const id of TOOLSET_IDS) {
    const p = answers?.[`toolset_${id}`]?.noul;
    // A probability outside [0, 1] is a malformed answer, not a strong one.
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return undefined;
    probabilities[id] = p;
  }
  const toolsets = TOOLSET_IDS.filter((id) => (probabilities[id] ?? 0) >= TOOLSET_SELECT_THRESHOLD);
  return { toolsets, probabilities };
}

/**
 * Ask Jev which tier the turn needs and which toolsets it will use, in one
 * request (the questions run in parallel on Jev's side). Resolves to null
 * when Jev is unavailable: not configured, circuit open, HTTP error,
 * timeout, or no usable tier answer. Resolves to a decision with
 * `tier: null` when the tier answer is below the confidence floor. Never
 * throws.
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
        questions: { tier: TIER_QUESTION, ...TOOLSET_QUESTIONS },
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
    const confident = answer.confidence >= JEV_MIN_CONFIDENCE;
    if (!confident) {
      console.log(
        `🤷 [jevDecision] Low confidence (${answer.confidence.toFixed(2)}) for "${answer.choice}" in ${latencyMs}ms; tier falls back to heuristics`,
      );
    }
    const toolsetRead = readToolsetAnswers(body.answers);
    if (!toolsetRead) {
      console.warn("⚠️ [jevDecision] Missing or malformed toolset answers; leaving toolset selection unset");
    }
    return {
      tier: confident ? answer.choice : null,
      confidence: answer.confidence,
      probabilities: answer.probabilities ?? {},
      latencyMs,
      model: body.model ?? provider.model,
      provider: provider.name,
      costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : undefined,
      toolsets: toolsetRead?.toolsets,
      toolsetProbabilities: toolsetRead?.probabilities,
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
