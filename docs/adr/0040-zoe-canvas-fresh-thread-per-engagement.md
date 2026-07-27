# Zoe canvas engagements are fresh Threads

## Status

Accepted — 2026-07-07

## Context

The **Zoe canvas** is the experimental `/home` surface where Zoe answers in the
page content: on send (hero input or a suggestion chip), the dashboard below
the input collapses and the answer streams in its place. The canvas shares the
drawer's conversation *state* — it reads and writes the same
`AgentModalProvider` messages, so a canvas engagement is visible in the drawer
afterwards ("Continue in panel" is free).

That sharing raised the question of conversational *identity*: should a canvas
send continue the active `conversationId`, the way [ADR-0006](0006-web-voice-shares-text-thread.md)
unified web voice and text onto one thread? The canvas deliberately renders
only the current engagement (its identity is "the page answering", not a
relocated chat window), so continuing the active thread would mean Zoe's
answer is steered by prior turns the surface is *hiding* — a fresh-looking
answer shaped by invisible context. It would also blur **Thread**-level
quality scoring (ADR-0012 judges "did the user get what they came for?" per
`conversationId`), mixing a crisp canvas intent ("standup on my projects")
into an unrelated running conversation.

## Decision

Each canvas **engagement** (one open→dismiss cycle) starts a **fresh Thread**:
a chip click or hero send is an implicit "new thread + send" with a new
`conversationId`. Follow-ups within the engagement continue that thread;
dismissal ends it. The previous drawer thread survives in conversation
history — it just stops being the active one.

This is a deliberate deviation from ADR-0006's "two surfaces, one thread"
precedent. ADR-0006 unified surfaces that render **the same visual thread**
(typed and spoken turns interleave in one transcript, so split memory caused
observable amnesia). The canvas is the inverse case: it intentionally does
*not* render the prior thread, so sharing the `conversationId` would create
the hidden-context hazard rather than cure one. The rule generalises as:
memory follows what the user can see.

## Consequences

- Canvas Threads are cleanly scorable and comparable: stamped with their own
  `platform` value (`web-canvas`) in `AiInteractionHistory`, one engagement =
  one Thread with one intent, judged against the drawer's Threads by the
  existing ADR-0012 machinery.
- Zoe does not carry yesterday's drawer context into a canvas ask. Users who
  want continuation use the drawer (⌘J), which remains the full-history
  surface.
- Dismissing the canvas (✕/Esc) or navigating away mid-stream aborts the
  stream and marks the turn `incomplete` (existing retry UI) — one rule for
  both exits.
