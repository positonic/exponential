/**
 * Redaction + truncation for persisted tool-call arguments.
 *
 * Tool args feed the agent-quality loop (ADR-0012 judges, ADR-0013 replay
 * baselines) and incident diagnosis, but they can carry secrets by design:
 * the Fireflies wizard passes raw API keys as tool args, Slack/email tools
 * carry message bodies. Everything stored on AiInteractionHistory.toolCalls
 * MUST pass through here first.
 */

export interface LoggedToolCall {
  name: string;
  /** Redacted JSON string of the call args, possibly truncated. */
  args: string;
  isError?: boolean;
  /** Short error code/message when the call failed (e.g. "url_not_allowed"). */
  errorCode?: string;
  /** True for provider-executed tools (webSearch, webFetch, toolSearch). */
  providerExecuted?: boolean;
  /** Set when per-turn budget forced this call's args to be dropped. */
  argsDropped?: boolean;
}

// Suffix-anchored: `apiKey`/`slackToken`/`tokens` redact, but entity-id keys
// like `keyResultId` (OKR tools) or `keywords` must survive — they're the
// grounding signal the judges read.
const SENSITIVE_KEY = /(api[_-]?key|key|token|secret|password|credential|authorization|bearer)s?$/i;
// Long unbroken base64url-ish runs are likely pasted credentials. CUIDs are
// 25 chars, so the 40+ threshold leaves IDs and URLs readable.
const TOKEN_LIKE = /[A-Za-z0-9_-]{40,}/g;

const MAX_ARGS_CHARS_PER_CALL = 500;
const MAX_CHARS_PER_TURN = 16_000;
const MAX_DEPTH = 6;

const REDACTED = "[redacted]";

function redactValue(value: unknown, keyHint: string, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[depth-capped]";
  if (typeof value === "string") {
    if (SENSITIVE_KEY.test(keyHint)) return REDACTED;
    return value.replace(TOKEN_LIKE, REDACTED);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return SENSITIVE_KEY.test(keyHint) ? REDACTED : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, keyHint, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactValue(v, k, depth + 1);
    }
    return out;
  }
  return undefined;
}

/**
 * Mask token-like runs in a plain string. For error messages and other
 * free text that may echo a credential (e.g. "Invalid API key ff_live_…").
 */
export function maskTokenLike(text: string): string {
  return text.replace(TOKEN_LIKE, REDACTED);
}

// Substring, not suffix like SENSITIVE_KEY: this guards a debug log, where
// hiding `keyResultId` costs nothing and missing `modelKeyOverride` would
// print a credential.
const SECRET_NAME = /key|secret|password|credential|token|jwt|auth/i;
// An Anthropic API key by its shape, whatever the entry holding it is called.
const ANTHROPIC_KEY_LIKE = /sk-ant-[A-Za-z0-9_-]+/g;

/**
 * RequestContext entries made safe to print in a debug log. An entry whose
 * name looks like a credential (key, secret, password, token, JWT, auth) keeps
 * its name and its length and nothing of its value, not even a prefix. Any
 * other value has Anthropic-key-shaped runs removed.
 *
 * A workspace's own model key is never placed in RequestContext at all
 * (Mastra pulls it through `mastra.getModelKey`); this is the second line of
 * defence for the day something named like one is.
 */
export function maskContextEntriesForLog(entries: ReadonlyArray<readonly [string, string]>): [string, string][] {
  return entries.map(([name, value]) => [
    name,
    SECRET_NAME.test(name) ? `${REDACTED} (${value.length} chars)` : value.replace(ANTHROPIC_KEY_LIKE, REDACTED),
  ]);
}

/**
 * Calm, generic, plain-language line shown to the user when the agent
 * stream emits a top-level `error` chunk. Never embeds the raw error —
 * internal error text (e.g. a Zod "Type validation failed" blob) must
 * never reach the end user and may also leak credentials.
 */
export const USER_FACING_STREAM_ERROR =
  "⚠️ Something went wrong on my end — please try that again.";

/**
 * Shown instead of USER_FACING_STREAM_ERROR when the provider error is a
 * billing or auth failure (see classifyProviderError). Retrying immediately
 * cannot help — nothing the user does fixes an exhausted account — so point
 * at "later" rather than "again". Deliberately does NOT promise that anyone
 * has been notified: reportHandledErrorServer is best-effort and may be
 * disabled, so that assurance could be false.
 */
export const USER_FACING_PROVIDER_UNAVAILABLE =
  "⚠️ The assistant's AI provider is unavailable right now — please try again in a little while.";

/**
 * Build the masked, server-side-safe rendering of a raw agent-stream error
 * for logging/diagnostics. Token-like runs are masked so credentials never
 * land in logs; this is NOT what gets streamed to the user (see
 * USER_FACING_STREAM_ERROR for that).
 */
export function formatUserFacingStreamError(rawMessage: string): {
  userMessage: string;
  loggedMessage: string;
} {
  return {
    userMessage: USER_FACING_STREAM_ERROR,
    loggedMessage: maskTokenLike(rawMessage),
  };
}

/** Redact secrets from tool args and serialize, capped per call. */
export function redactToolArgs(args: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(redactValue(args, "", 0)) ?? "null";
  } catch {
    return "[unserializable]";
  }
  return serialized.length > MAX_ARGS_CHARS_PER_CALL
    ? `${serialized.slice(0, MAX_ARGS_CHARS_PER_CALL)}…[truncated]`
    : serialized;
}

/**
 * Enforce the per-turn budget: once the running total exceeds the cap,
 * later calls keep their name/error but lose their args. Names are the
 * cheap signal the judges already rely on; never drop those.
 */
export function capToolCallsForTurn(calls: LoggedToolCall[]): LoggedToolCall[] {
  let budget = MAX_CHARS_PER_TURN;
  return calls.map((call) => {
    if (call.args.length <= budget) {
      budget -= call.args.length;
      return call;
    }
    return { ...call, args: "", argsDropped: true };
  });
}
