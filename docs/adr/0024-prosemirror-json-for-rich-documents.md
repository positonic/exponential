# ProseMirror JSON for rich, node-addressable documents

## Status

Accepted — 2026-06-18 (documented retroactively 2026-06-25; the schema already referenced "ADR-0024" before this file existed).

## Context

[ADR-0017](0017-markdown-canonical-content-format.md) made **Markdown the canonical stored format for authored prose** and explicitly rejected Tiptap/WYSIWYG-to-HTML. That holds for ordinary prose fields (descriptions, comments, updates, chat).

The PRD/feature editor (`PrdDocument`) needs more than prose: a slash-command menu, task lists, image nodes, and — critically — **anchored comments**, which require addressing a stable position *inside* the document. A flat Markdown string has no stable node identity to anchor a comment to. So `Feature` stores a richer representation than a prose field can carry.

## Decision

For documents that need **node-addressable structure** (anchored comments, slash menu, block-level editing), store a **ProseMirror JSON document as the canonical value**, alongside a **derived Markdown projection** for portability:

- `Feature.descriptionDoc: Json` — canonical ProseMirror document, what the editor reads/writes.
- `Feature.description: String` — Markdown projection, **write-only/derived** (serialized client-side via `tiptap-markdown` on every save, never read back into the editor). Keeps the content greppable, diff-able, agent-readable, and embeddable — i.e. it still satisfies ADR-0017's *intent* on the read side.
- `Feature.docVersion: Int` — optimistic-concurrency guard (compare-and-set on save).
- Lazy one-time migration (`initDescriptionDoc`): legacy Markdown → ProseMirror JSON on first open, idempotent.

This is a **scoped exception** to ADR-0017, not a reversal. ADR-0017 remains the default for prose; ProseMirror JSON is reserved for documents that genuinely need structure. The shared Tiptap extension set lives in `~/lib/prd/extensions` (`buildPrdExtensions`).

## Consequences

- A second sanctioned storage format exists for a deliberately narrow set of entities. New use of it must clear the same bar (real need for node addressing), and must keep the Markdown projection so the read side stays ADR-0017-compatible.
- The projection is lossy on round-trip (comment marks drop) — accepted, because the JSON is canonical and the Markdown is only a projection.
- Markdown-only API writes (CLI/SDK/agents updating the Markdown without a doc) must not diverge from the canonical doc. Two sanctioned resolutions exist: `feature.update` re-derives `descriptionDoc` from the incoming Markdown server-side (`~/server/services/prd/markdown-doc` — the client codec run under a scoped happy-dom), while `page.update` nulls out `bodyDoc` and lets the editor re-derive it lazily on next open. Both bump `docVersion` so a stale open editor conflicts instead of clobbering. _Amended 2026-10-01:_ anchored comment marks are carried across such a rewrite (`feature.update`, `ticket.update`, `page.update`) wherever their text survived, re-found by quote and surrounding context (`carryCommentMarks` in `~/lib/prd/comment-anchor`). A quote whose context no longer matches is dropped rather than re-pinned to the same words elsewhere. `page.update` therefore re-derives the doc server-side, instead of nulling it, when the old doc has marks to keep. A thread whose text the rewrite removed becomes orphaned, as an editor deletion would. This was previously an accepted loss.
- A new thread's `comment` mark is written into the stored doc **by the server**, in the same request that creates the thread's root comment (`anchorThreadInStoredDoc`, a compare-and-set on `docVersion`), not left to the editor's next autosave. That save is rejected whenever the doc changed elsewhere (a docVersion CONFLICT), which used to leave the fresh thread orphaned with no highlight. The client sends the selection's positions, which are trusted only while the doc is still at its base version, plus the quote's context for when it isn't. The editor runs the request in line with its own save queue and adopts the resulting version, so the tab can't conflict with itself. The comment row and the doc write are separate writes, not one transaction. The client's own save remains the fallback where the server doesn't write: a page viewer (who can comment but not edit), or a doc not yet migrated from Markdown.
- Extended to **Pages** by [ADR-0033](0033-knowledge-pages.md), which reuses this exact pattern.
