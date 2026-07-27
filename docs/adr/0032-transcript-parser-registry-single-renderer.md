# Transcript rendering: a content-sniffing parser registry feeding one renderer, derived on read

## Status

Accepted — 2026-06-25. Builds on the **Speaker** definition in [CONTEXT.md](../../CONTEXT.md)
("derived from the transcript… else from plain-text turn parsing for a manually uploaded
transcript") and on [ADR-0014](0014-meeting-visibility-single-resolver.md)'s preference for a single
canonical derivation over scattered copies.

## Context

A **Meeting** (`TranscriptionSession`) stores its transcript in one nullable `transcription` string.
Two shapes flow through it today, with more tools expected:

- **Fireflies** — a JSON blob `{ sentences: [{ text, speaker_name, start_time, end_time }] }` (also
  mirrored in `sentencesJson`).
- **Device / manual paste** — plain text with identity-relative labels, e.g. `Me:` / `Them:`, no
  timestamps, prefixed by header lines (`Meeting Title:`, `Date:`, `Meeting participants:`) and a
  `Transcript:` marker.

The same "is this Fireflies JSON or plain text?" decision had been re-implemented in at least three
places that carried "must mirror" comments — `TranscriptTab.parseSentences`,
`meeting-view-model.countTranscriptTurns`, and `extractReadableTranscript`/`FirefliesService` — and
**two** renderers had diverged: `TranscriptTab` (the `/recording/[id]` redesign, custom `mp-*` CSS,
search/chapters/flavors) and `TranscriptionRenderer` (Mantine cards in the meetings list). Critically,
**neither parsed the `Me:`/`Them:` format** — both dropped it to an unstructured pre-wrapped blob, so
the most common manual transcript rendered as a wall of text instead of speaker turns.

## Decision

**Normalize once, render once. Detection is content-driven and derivation happens on read.**

1. **One canonical shape — the Transcript turn.** `parseTranscript(input)` returns
   `TranscriptTurn[]` where a turn is `{ text, speaker: string | null, flavor: "me"|"them"|"alt"|null,
   startTime: number | null }`. `startTime` is `null` for timeless pastes (the renderer hides the
   time gutter, never fakes `00:00`); `flavor` is `null` only for the speaker-less fallback.
   **`flavor` is resolved in the parser, not the renderer** — structured sources map host/participant
   identity, and identity-relative sources (`Me:`) carry it in the label.

2. **A priority-ordered, content-sniffing parser registry** (`src/lib/transcript/`). Each parser
   exposes `canParse(input)` + `parse(input)`; the stored `provider` is a **soft hint, never
   required**. Order: **fireflies** (a `sentences[]` array) → **labelled-turns** (`Name: text` with
   multi-line accumulation, `Transcript:`-marker + known-meta-key header stripping, `[SCREENSHOT]`
   stripping, `Me`/host → `me` and others rotating `them`/`alt`) → **raw fallback** (one speaker-less
   turn — never invents a speaker). Adding Otter/Whisper later is one new array entry.

3. **Pure, derived on read — no new column, no endpoint.** `src/lib/transcript/` is dependency-free
   and runs client- and server-side. Turns are derived per render (memoized; transcripts are bounded
   by the summarizer's 200K-char cap). `countTranscriptTurns` collapses to `parseTranscript().length`
   and `extractReadableTranscript` re-derives from turns, retiring the duplicate sniffing.

4. **One renderer.** `TranscriptView` (the refactored `TranscriptTab`) consumes `TranscriptTurn[]`
   with `variant="full" | "preview"`, absorbing `TranscriptionRenderer`'s copy-all and preview
   behaviour. All three call sites migrate to it; `TranscriptionRenderer` is deleted.

## Considered alternatives

- **Provider-keyed dispatch first** (look up the parser by DB `provider`/`sourceIntegrationId`).
  Rejected: `provider` is often null on older/manual rows and a tool can change its export shape,
  whereas the Fireflies JSON shape is self-identifying. Provider stays a tie-breaker, not the key.
- **Persist parsed turns / serve from a tRPC endpoint.** Rejected: a Speaker is a *derived* read
  concept (CONTEXT.md), turns are cheap and bounded, and a column would need backfill + invalidation
  on every transcript edit. Derive on read.
- **Keep two renderers (or one core + two skins) fed by the shared parser.** Rejected in favour of
  full consolidation now: the parser kills the duplication regardless, but leaving two presentational
  shells perpetuates the drift that produced this state. One `TranscriptView`.
- **Aggressive header stripping** (drop any non-speaker-like label before the first real turn).
  Rejected: risks eating a legitimate named opening turn. Strip only above a `Transcript:` marker and
  a known-meta-key allowlist; an unknown leading `Foo: bar` is treated as a real turn.

## Consequences

- New `src/lib/transcript/` module (registry + parsers + `TranscriptTurn`), unit-tested with the
  `Me:`/`Them:` paste as a fixture — pure functions, no DB.
- `TranscriptTab` → `TranscriptView`; `TranscriptionRenderer` deleted; `MeetingsContent`'s two call
  sites migrated (touches the meetings-list UI — the accepted blast radius).
- `meeting-view-model` and `extractReadableTranscript` depend on the parser, removing the "must
  mirror" copies.
- `Me:`/`Them:` transcripts now render as speaker turns on `/recording/[id]` and in the list.
- Header lines never become bogus Speakers/Participants, preserving the Speaker≠Participant boundary.
