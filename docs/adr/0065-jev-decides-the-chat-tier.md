# Jev decides the chat tier; OpenRouter is a second provider, not the primary path

## Status

Accepted — 2026-10-07

## Context

Every chat turn through `/api/chat/stream` first picks a model tier: `pickModelTier` routes
trivial turns to a Haiku variant of Zoe and hard turns to Sonnet, sticky per conversation. The
decision was a list of regexes (greetings, `@think`, "plan/design/analyze" over 200 chars). It
was cheap and deterministic, and it misrouted anything that did not match a pattern.

On 2026-10-07 the Anthropic account ran out of prepaid credit. Every turn failed with the generic
"Something went wrong on my end" line, and the route retried each failure on Sonnet under the
same key. The incident raised two questions at once: how to make the tier decision smarter, and
whether to move model access to OpenRouter for resilience and cheaper open-weight models.

Three facts shaped the answer:

1. Zoe's cost profile depends on Anthropic-direct features: prompt-cache breakpoints, deferred
   tool loading with the BM25 tool-search server tool (a "hi" turn drops from ~80K to 15-20K
   input tokens), and Anthropic's server-side web search and fetch tools. None of these pass
   through OpenRouter. Routing Zoe wholesale through OpenRouter would raise cost per turn, and it
   would not have prevented the outage, which was a prepaid balance, not a provider.
2. Open-weight pricing is not uniformly cheap. GLM 5.2 on OpenRouter costs more per output token
   than Haiku 4.5, and agent turns are output-heavy (tool-call JSON). The genuinely cheap
   candidates (GLM 5.3 Flash, Qwen 3.7 Flash) need eval evidence before running tools.
3. TypeSafe's Jev is a "System One" model: typed Choice/Score questions in, calibrated
   probabilities and a confidence out, 70-500 ms, $0.042 per million input tokens, no free
   text. It is the right shape for "which tier does this turn need", and the wrong shape for
   answering the turn. It is reached directly at `api.typesafe.ai`; the OpenRouter listing
   `typesafe/jev-router` is a different product (an opaque chat router) and is not used.

## Decision

1. **Jev is the turn decision layer.** `pickModelTier` asks Jev one Choice question (`fast` vs
   `deep`) over the latest message plus up to six prior turns, after stickiness and the explicit
   `@think` opt-in, and before the regexes. It acts on confidence ≥ 0.5 (TypeSafe's documented
   floor). On no key, low confidence, timeout (800 ms ceiling), malformed response or any error,
   the regexes decide exactly as before. A 401/402/403 from TypeSafe disables Jev for ten
   minutes so a dead key costs one failed round-trip per cooldown.
2. **Provider errors are classified, not masked uniformly.** The stream route classifies the
   agent error into billing, auth, rate-limit, overloaded or unknown. Billing and auth skip the
   Sonnet retry, show a "provider unavailable, team notified" line instead of "try again", and
   carry the kind into the error report.
3. **Anthropic direct stays the primary path for Zoe and the assistant.** OpenRouter is adopted
   as a second provider through Mastra's model strings and fallback arrays: first for the
   batch-shaped jobs (observational memory, channel summarizer) and as an outage fallback for
   the Haiku tier, later as the home for open-weight candidates once tool loading no longer
   depends on Anthropic's deferral (a prerequisite, tracked separately).

## Consequences

- Tier decisions gain a confidence and a latency we can log and evaluate; misroutes become a
  prompt-and-criteria problem instead of a regex problem.
- One more vendor in the hot path, bounded by a hard timeout and a null fallback. The regexes
  are kept, not deleted, so Jev can be switched off by unsetting one env var.
- The cheap-model question is deferred to measurement: the eval replay in the mastra repo
  decides which models may run tools, not the price list.

## Rejected

- **OpenRouter as the only provider.** Loses prompt caching, tool deferral and server tools;
  bill moves rather than shrinks.
- **An LLM classifier (Flash-class model, structured output) as the decision layer.** Works
  without a new vendor, but 300-800 ms and no calibrated confidence. Kept as the fallback plan
  if TypeSafe access turns out to be gated.
- **`typesafe/jev-router` on OpenRouter.** Answers the chat itself on a model of its choosing;
  cannot target a Mastra agent with tools and memory, and exposes no confidence.
