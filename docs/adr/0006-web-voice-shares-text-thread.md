# Web voice and text chat share one memory thread; iOS stays user-scoped

## Status

Accepted — 2026-06-03

## Context

In the web Zoe drawer (`ManyChat`) a user can both type and talk, and both
turns render in one visual thread (the 🎙 marker distinguishes spoken ones).
Underneath, the two modes wrote to **different Mastra memory threads**: text
chat keys memory on `conversationId` (`/api/chat/stream` → `thread.id =
conversationId`, `resource = userId`), while voice keys on
`voiceThreadKey(userId)` → `voice-${userId}` (`voiceTranscriptBridge.ts`). The
voice isolation was a deliberate earlier decision ("ISOLATE — voice turns kept
isolated from text-chat memory").

The consequence was cross-mode amnesia: a user would extract action items by
typing, then switch to voice to act on them, and the voice **brain** — running
on a separate thread — could not see the typed conversation. The observed
failure ("I've added both" → moments later "I can't see anything that's been
discussed before or any items that got created") is exactly this seam.

The **Voice router** is, by design, a zero-knowledge router (it must always
defer to a tool and never answer from memory). The split is therefore not a
router problem — it is purely about which memory thread the server-side
**brain** (`voice.dispatch` / `ask_exponential`) reads and writes. Critically,
the type-and-talk seam only exists on **web**: the iOS voice client has no
concurrent text chat, so its user-scoped voice thread is correct as-is.

## Decision

1. **Web unifies voice and text onto one thread.** The web client passes its
   active `conversationId` into `voice.createSession`, which bakes it into the
   voice-session token claim (same "token claim is authoritative" pattern as
   `workspaceId`). `dispatch` / `persistTurn` / `askExponential` use that
   `conversationId` as the thread key when present, so the brain reads and
   writes the same thread the text chat uses (`resource = userId` already
   matches on both sides — only `threadId` differed).

2. **iOS is unchanged.** With no `conversationId` in the token, the thread key
   falls back to `voiceThreadKey(userId)` = `voice-${userId}`. The router
   persona, the coarse tools, and the createSession contract (ADR-0005) are
   untouched. The divergence is intentional and surface-specific.

3. **Referential requests route to the brain.** Coarse tools are memory-free by
   design, so a referential phrase ("capture *that* one", "complete *the first*
   one") cannot resolve against the thread. The canonical **router persona**
   gains a rule routing such phrases to `ask_exponential` (the memory-aware
   brain) while self-contained phrases ("capture buy milk Friday") stay on the
   fast coarse path. Because the rule is the same on both surfaces but the
   thread differs, it resolves against the combined type+talk history on web and
   against prior voice turns on iOS — a net fix for iOS too, where referential
   coarse captures also misfired before.

4. **The 🎙 marker becomes purely presentational** on web — it labels a turn's
   modality, not a separate memory.

## Considered alternatives

- **Read-only context bridge** (inject recent text turns into voice dispatch but
  keep voice turns on a separate thread). Rejected: voice's own actions would
  still live in a separate history, so "did you create it?" stays broken.
- **Page-context only** (pass the on-screen recording/actions into dispatch, no
  memory change). Rejected: resolves "that one" from the screen but not earlier
  conversation turns; doesn't fix cross-mode amnesia generally.
- **Make coarse tools memory-aware.** Rejected: contradicts the documented
  Coarse-vs-Brain boundary (coarse = "no LLM, verbatim phrase"), adds an LLM hop
  to the fast path, and regresses the iOS fast path on every coarse call.
- **Unify iOS too (single canonical thread model).** Rejected for now: iOS has
  no text conversation to join, so user-scoping is the correct model there;
  forcing parity would add churn for no behavioural gain.

## Consequences

- Reverses the ISOLATE assumption **for web only**. The marker-keyed isolation
  test (`voiceTranscriptBridge.test.ts` asserting `voice-u1`) still describes the
  iOS / no-conversationId path and stays valid; web adds coverage for the
  conversationId-keyed path.
- "Complete *that* one" now self-confirms via the agent's own confirmation
  (brain passthrough) rather than the coarse `complete_action` spoken handshake;
  named completes ("complete the JWT refactor") keep the fast coarse handshake.
- Referential requests cost an agent roundtrip instead of the deterministic
  coarse path — scoped to referential phrases only.
- The live Realtime/WebRTC session still cannot survive a refresh; on resume the
  web client mints a fresh session bound to the **same** `conversationId`, so the
  brain recovers full context without the cold re-greeting. Voice is never
  auto-started on page load (no surprise hot mic); resume is an explicit tap.
- Edge case (accepted for v1): a voice session token pins one `conversationId`
  for its ~30-min TTL. If the user starts a new text conversation mid-session,
  the live voice session keeps writing to the original thread until restarted.
