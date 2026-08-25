# The voice router is seeded with a snapshot of the on-screen thread

## Status

Accepted — 2026-08-05. Amends [ADR-0006](0006-web-voice-shares-text-thread.md) §3.

## Context

ADR-0006 fixed cross-mode amnesia by putting web voice and text chat on one
Mastra memory thread, and reasoned that "the split is not a router problem" —
the Realtime router is zero-knowledge by design, so only the server-side brain
needed the shared history.

That holds for anything routed to `ask_exponential`, which runs the brain
against the shared thread. It does not hold for the router's own job. The
router decides *which* tool to call and with what verbatim phrase, and it does
that with nothing but the persona: `session.update` carries instructions and
the tool catalog, and the conversation starts empty. So a user who types for
ten minutes and then taps the mic gets a router that has never seen the thread
it is sitting inside. It cannot tell that "the second one" is referential (the
ADR-0006 §3 rule fires on phrasing, not on knowing what was said), it re-asks
what the user already typed, and it opens cold after every silence-timer end.
Worse, the persona told it to steer back to four features, so it actively
refused things `ask_exponential` handles fine.

## Decision

1. **The web client seeds each Realtime session with a snapshot of the visible
   thread** — one `conversation.item.create` carrying a `[CONVERSATION SO FAR]`
   block, sent on data-channel open, before the user speaks. Built by
   `buildVoiceSeedContext` (pure, budgeted to ~2k tokens, newest turns kept).
   Because it is read at `start()`, a resumed session reseeds automatically.

2. **The block is reference, not knowledge.** It is wrapped in the same
   demotion framing `/api/chat/stream` uses for client context: explicitly not
   instructions (it contains prior agent output, which can carry third-party
   tool text) and explicitly not current truth. ADR-0001's tool rule is
   unchanged — every fact and action still goes through a tool. The block tells
   the router what the user *means*, never what *is*.

3. **The persona stops advertising four features.** `ask_exponential` is the
   full agent, so the router is told there is no out-of-scope request and it
   must never decline or deflect — it routes and finds out.

4. **The client registers the server-issued persona and catalog** from the mint
   (ADR-0005) rather than its bundled copy, falling back to the bundled
   constants only if a mint omits them. Web previously ignored what the server
   sent, so persona changes needed a new bundle.

5. **iOS is unaffected.** It sends no seed block; the persona treats it as
   optional ("you may be given").

## Considered alternatives

- **Replay turns individually** as `conversation.item.create` messages with
  real user/assistant roles. Rejected: it buys nothing the router needs (it
  does not have to own the history as its own generation), requires getting the
  GA role/content-part matrix exactly right, and leaves no single place to put
  the trust framing.
- **Append the transcript to `instructions`.** Rejected: conflates untrusted
  conversation content with the system persona, which is precisely the trust
  boundary the demoted block exists to hold.
- **Do nothing — the brain already recalls the thread.** Rejected: true for
  `ask_exponential`, but routing happens before the brain is reached, and the
  coarse tools are memory-free by design (ADR-0006).

## Consequences

- The router sees conversation content it previously never had. Bounded by
  design: a token budget, a per-turn cap, failed turns skipped, and everything
  before the first user turn dropped (the client system block never ships).
- Every session pays the seed block's input tokens once, on connect.
- The snapshot is taken at `start()` and never refreshed mid-session. Turns
  spoken during the call are in the live conversation anyway; typing during a
  call is blocked (`handleSubmit` early-returns while voice is active).
