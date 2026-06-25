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
- Extended to **Pages** by [ADR-0033](0033-knowledge-pages.md), which reuses this exact pattern.
