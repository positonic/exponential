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
