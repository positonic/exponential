# Server is the single source of truth for the voice tool catalog and router persona

## Status

Accepted — 2026-06-03

## Context

The voice surface runs on two clients — the iOS app (`../exponential-ios`, Swift) and
the web voice client (this repo, `src/lib/voice/`) — both fronted by the same OpenAI
Realtime model (the **voice router**). Each client must register two things with Realtime
at session start: the **voice tool catalog** (the four coarse tools + the `ask_exponential`
brain passthrough, in the Realtime flat-function shape) and the **router persona** (the
system instructions).

Today each client **hardcodes its own copy**:

- Web: `VOICE_TOOL_CATALOG` + `VOICE_ROUTER_INSTRUCTIONS` in
  `src/lib/voice/voiceToolCatalog.ts`.
- iOS: `RealtimeToolCatalog.tools` + `RealtimeToolCatalog.routerInstructions` in
  `app/ExponentialVoice/Realtime/RealtimeToolCatalog.swift`.

The two have **already drifted**: the iOS persona carries a "YOU ARE THE SYSTEM — never tell
the user to check their own list" paragraph that the web persona lacks. Nothing prevents
further divergence — the tool descriptions, the confirmation-handshake wording, and the
persona are maintained in parallel in two languages, kept in sync only by manual diffing.
The brain that actually executes these tools (`voice.dispatch`) lives once, server-side, so
the duplication is entirely in how clients *describe* the surface, not how it behaves.

`voice.createSession` is already on the critical path for every session and already returns
session config (`realtime.model`, `realtime.voice`). It is the natural place to also hand out
the catalog and persona.

## Decision

1. **The server owns the canonical catalog and persona.** `voice.createSession` emits
   `toolCatalog` (the exact Realtime `session.update.tools` array — `{type, name,
   description, parameters}`, `parameters` as a native JSON object, not stringified) and
   `routerInstructions` in its response. The canonical text is the single TS constant in
   `src/lib/voice/voiceToolCatalog.ts`, imported by both the server router and the web hook.

2. **The persona is reconciled to the superset.** The canonical
   `VOICE_ROUTER_INSTRUCTIONS` gains the iOS-only "YOU ARE THE SYSTEM" paragraph, so neither
   client regresses. The web voice client (live on the `voice-web-client` branch) gains that
   instruction as a result — an intended behavioural change.

3. **iOS holds no hardcoded copy — fail loud.** iOS deletes `RealtimeToolCatalog.tools` and
   `RealtimeToolCatalog.routerInstructions`, decodes the two fields from the createSession
   payload (optional in Codable, since Swift ignores unknown keys), and **errors the voice
   session with a clear message if they are absent** rather than falling back to a bundled
   default. Drift is then structurally impossible: there is no second copy to drift.

4. **Web keeps importing the constant.** Web and the server are one TS repo and share the
   constant by import, so there is no TS-side drift to solve; web does not consume the
   runtime payload. The payload contract is therefore exercised in production solely by iOS.

5. **The vestigial `COARSE_TOOLS` export** in `voice.ts` (unused; the dispatch switch uses
   literal case strings) is deleted as part of the same change.

## Considered alternatives

- **Keep a bundled fallback on iOS** (`payload.toolCatalog ?? RealtimeToolCatalog.tools`).
  Rejected: the bundled copy still exists and can re-drift, a stale fallback could silently
  mask a broken server, and it only weakly achieves "stop hardcoding". The fail-loud window
  is small because the server deploys before the app build that depends on it, and already-
  shipped (old) builds keep using their own hardcode regardless.
- **Web also consumes the payload at runtime** (true parity with iOS). Rejected by the owner:
  unnecessary churn for a client that already shares the constant by import; the runtime
  contract is iOS-only by design.
- **Adopt the shorter web persona as canonical.** Rejected: it would drop the deliberate iOS
  "YOU ARE THE SYSTEM" instruction and let Zoe punt users to "check your list" again.
- **A separate `voice.getCatalog` endpoint.** Rejected: it adds a round-trip before a session
  can start; folding the fields into the createSession response that iOS already awaits adds
  no latency (~a few KB on a call already on the critical path).

## Consequences

- Two repos, ordered rollout: the server change (emit the fields) lands **first**; the iOS
  change (decode + delete hardcode + fail-loud) lands after. An old server that stops
  emitting the fields will brick voice on the new iOS build until fixed — accepted.
- No contract versioning is added. Forward-compat holds without it: iOS decodes `parameters`
  as opaque JSON (shape changes inside it don't break decoding), and a new coarse tool in the
  payload is registered and then forwarded by name+`phrase` to `voice.dispatch` like any
  other — old (pre-migration) builds are unaffected because they use their own frozen copy.
- The catalog/persona payload is non-sensitive (prompts and tool names, already visible to
  the model), so emitting it to any authenticated voice caller carries no new exposure.
- Per-`mode` tailoring of the persona (e.g. priming "give the plan first" in `daily-brief`
  mode) becomes *possible* now that the server authors the text, but is **out of scope** —
  one static canonical persona for v1.
