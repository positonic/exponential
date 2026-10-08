/**
 * Classifies a raw model-provider error (the `error` chunk a Mastra agent
 * stream emits when the upstream LLM call fails) into a small set of kinds
 * the chat route can act on.
 *
 * Why this exists: on 2026-10-07 the Anthropic account ran out of prepaid
 * credit. Every turn failed, the route masked each failure into the generic
 * "Something went wrong on my end" line, then burned a second failed call
 * retrying on Sonnet. Nothing distinguished "out of money" from a transient
 * model hiccup. Billing and auth failures are deterministic: a retry on a
 * sibling model under the same key cannot succeed, and the user needs a
 * different message than "try again".
 *
 * Matching is on the provider's message text, masked or not, because that
 * is all the stream carries by the time it reaches this route. Patterns are
 * deliberately loose and provider-agnostic (Anthropic, OpenAI, OpenRouter
 * all phrase these similarly).
 */

export type ProviderErrorKind =
  | "billing"
  | "auth"
  | "rate-limit"
  | "overloaded"
  | "unknown";

const BILLING =
  /credit balance|insufficient[_ ]credits?|insufficient[_ ]quota|exceeded your current quota|billing|payment required|\b402\b|purchase credits|plans & billing/i;
const AUTH =
  /authentication[_ ]error|invalid[_ ]api[_ ]key|invalid x-api-key|incorrect api key|unauthori[sz]ed|permission[_ ]error|\b401\b|\b403\b/i;
const RATE_LIMIT = /rate[_ ]limit|too many requests|\b429\b/i;
const OVERLOADED = /overloaded|\b529\b|service unavailable|\b503\b|capacity/i;

export function classifyProviderError(rawMessage: string): ProviderErrorKind {
  const text = rawMessage ?? "";
  // Order matters: Anthropic reports credit exhaustion as a 400
  // `invalid_request_error`, and some providers phrase auth failures with
  // "quota". Billing first, then auth, so the most actionable kind wins.
  if (BILLING.test(text)) return "billing";
  if (AUTH.test(text)) return "auth";
  if (RATE_LIMIT.test(text)) return "rate-limit";
  if (OVERLOADED.test(text)) return "overloaded";
  return "unknown";
}

/**
 * True when retrying the same turn on a sibling model under the same
 * provider key is pointless. Rate limits and overloads are per-model and
 * transient, so those still get the Sonnet retry.
 */
export function isNonRetryableProviderError(kind: ProviderErrorKind): boolean {
  return kind === "billing" || kind === "auth";
}
