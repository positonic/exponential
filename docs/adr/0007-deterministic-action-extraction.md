# Meeting Actions are extracted deterministically; the drawer reviews and refines, it does not extract

## Status

Accepted — 2026-06-03

## Context

The Meeting detail page (`/recording/[id]`) accreted three overlapping ways to turn a
meeting into work:

1. **Structured Action extraction** — `SaveActionsButton` ("Save Actions" → "Review
   Actions") calls the `transcription.generateDraftActions` tRPC, which runs
   `TranscriptionProcessingService.generateDraftActions`. Drafts persist as `Action` rows
   with DRAFT status and are reviewed in `TranscriptionDraftActionsModal` (checkboxes,
   per-row edit, bulk publish) before being published. A hard rule holds here: **Actions are
   never auto-published — a human always reviews drafts first.**
2. **Free-form agent chat** — the "Agent" tab (`RecordingChat`) used the *old* `Chat`
   component plus a "Parse Transcript & Create Issues" button that created **GitHub issues**
   (not Actions) in a hardcoded `akashic-fund/akashic` repo.
3. **The shared Zoe drawer** (`ZoeDrawer` / `ManyChat`, mounted globally via
   `AgentModalProvider`) — the agent surface used everywhere else, already registered with
   the recording page's context and already exposing `openWithPrompt`.

We are consolidating to one surface: the Meeting detail page reads (Overview · Transcription
· Screenshots), and the shared drawer is the single place actions are created. The Actions
tab and the Agent tab are removed; the GitHub-issue path is dropped entirely (see
Consequences). A new **Create Actions** button in the Overview's Actions section opens the
drawer.

The live question is *who extracts*. Now that creation moves into an agent drawer, the
obvious-looking move is to let Zoe (the Mastra agent) extract actions agentically — open the
drawer with a seeded prompt, let the agent call a create-action tool, render what it
produces. That is **not** what we chose, and a future reader will reasonably wonder why an
agent drawer doesn't just let the agent do the extraction.

## Decision

**Extraction is deterministic. The agent drawer is the review-and-refine surface, not the
extractor.**

1. **`Create Actions` calls `generateDraftActions` directly (tRPC), not via the LLM.** The
   button opens the drawer and **injects the draft card into the active conversation thread**
   (it does *not* clear or fork the thread), then triggers the existing deterministic
   pipeline. The extraction quality and the never-auto-publish safety rule are preserved
   exactly as they are today. Because extraction reads the *transcript*, not the chat thread,
   it needs no clean-thread context — so appending is free, and it aligns with
   [ADR-0006](0006-web-voice-shares-text-thread.md), which makes the web drawer one continuous
   voice+text thread keyed on `conversationId`. Calling `clearChat()` here would orphan a live
   voice session pinned to that `conversationId`; the existing "New thread" control in
   `ZoeDrawer` remains the user's explicit reset.

2. **Drafts render as a new interactive message type in `ManyChat`** — a
   `DraftActionsReviewCard` with checkboxes, per-row edit, and bulk publish, published via
   the existing `publishDraftActions` / `publishSelectedDraftActions` mutations. This is the
   first *interactive* (not read-only) message payload in `ManyChat`; `ToolActivity` was
   display-only. Zoe's chat text only frames the card ("I found 6 — review below").

3. **Conversational refinement is layered on top, on the same thread (Phase 2).** Once the
   deterministic card exists, the user can refine the draft set in chat before publishing
   ("merge #2 and #4", "reassign the bug to Sarah", "add one for the ADR"). This is the
   payoff that justifies moving creation out of the modal and into the drawer at all.

4. **Phasing.** Phase 1 ships the full consolidation (both tabs and both legacy buttons
   removed, deterministic card in the drawer). Phase 2 adds conversational refinement.

## Considered alternatives

- **Fully agentic extraction** — open the drawer with a seeded prompt and let Zoe call a
  create-action tool, rendering the card from tool output. Rejected: extraction quality
  becomes "whatever this LLM run did" instead of the vetted pipeline, and routing creation
  through the agent risks bypassing the never-auto-publish guarantee. The conversational
  flexibility it offers is recovered in Phase 2 *on top of* the deterministic pass, with no
  loss of safety.
- **Deterministic card only, no chat refinement** — render a static checkbox card in the
  drawer and stop there. Rejected: that is `TranscriptionDraftActionsModal` rebuilt in a new
  location for no benefit. The only reason to leave the modal is to gain conversational
  refinement; without it, the move isn't worth the cost.
- **Keep the existing modal, opened from the drawer** — `Create Actions` opens the drawer,
  which then pops the existing review modal over it. Rejected: stacking a modal over the
  drawer is two overlapping surfaces fighting for the same screen — worse UX than either
  alone.
- **Open in a fresh, meeting-scoped thread** (`clearChat()` → new `conversationId`) rather
  than appending. Rejected after reconciling with [ADR-0006](0006-web-voice-shares-text-thread.md):
  the web drawer is one continuous voice+text thread, and clearing it mid-session would orphan
  a live voice session pinned to the old `conversationId`. The clean-context benefit is moot
  here because deterministic extraction reads the transcript, not the thread. The existing
  "New thread" control remains the explicit reset for users who want a clean slate.

## Consequences

- **`ManyChat` gains an interactive-message-component pattern.** A draft card with controls
  and a publish mutation living inside a chat message is new surface area. This sets the
  template for future in-chat interactive cards; it also means `ManyChat` is no longer a
  pure text/markdown + read-only-tool-strip renderer.
- **Deletions.** `RecordingChat`, `ParseTranscriptButton`, the GitHub-issue creation path
  (hardcoded `akashic-fund/akashic`), the header `SaveActionsButton`, the floating
  "Want me to create actions?" bubble, and `AutoSwitchActionsEffect` all go. Zoe can still
  create GitHub issues conversationally if a workspace repo is configured, but there is no
  dedicated button.
- **The never-auto-publish rule is structurally preserved** because the publish path is
  unchanged — only the review *surface* moved from a modal to an in-drawer card.
- **Copy aligns to the glossary** — user-facing strings on this page move from
  "transcription"/"recording" to **"Meeting"** (per `CONTEXT.md`). The `/recording/` route
  and DB names are deliberately out of scope.
- **The drawer becomes meeting-aware on open.** `Create Actions` appends the draft card to
  the active continuous thread and seeds meeting context; it does not start or clear a thread.
  This keeps voice+text+actions on one `conversationId` (per ADR-0006), so a user can extract
  by click and then talk to act on the results with the brain seeing them.
- **Ordering dependency on ADR-0006.** The Create-Actions flow (ticket `odd.panther`) builds
  on the unified-thread contract from Continuous Zoe's `damp.finch`; that change should land
  in `main` first so this flow appends to the settled `conversationId` model.
