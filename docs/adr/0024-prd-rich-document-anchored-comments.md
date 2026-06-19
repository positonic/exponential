# PRD body is a rich document with anchored comments (scoped exception to ADR-0017)

## Status

Accepted — 2026-06-18

## Context

Teams need to **discuss** a PRD the way they do in Linear and Notion: select a span of
text in the document, leave a comment pinned to those exact words, reply in a thread, and
resolve it. The discussion target is the **Feature** detail page (the PRD),
`/w/[slug]/products/[productSlug]/features/[featureId]`.

Today that page renders `Feature.description` (a Markdown `String?`) through the read-only
`MarkdownRenderer`, and the only way to edit is `EditFeatureModal`, which uses a bare
`<Textarea>` — itself an ADR-0017 violation. There is no formatting affordance, no
discussion, and no way to anchor anything to the text.

A comment that **stays glued to the words it was left on** — surviving edits, reflows, and
reordering — is the entire point of the feature. That requires a document model where every
span of text has a **stable, addressable position**: a node/mark tree (ProseMirror, as
Linear uses via Tiptap) or a block model with per-block IDs (as Notion uses). A Markdown
**string** has none of this: anchoring to character offsets drifts or breaks the moment
anyone edits above the anchor.

This collides head-on with **[ADR-0017](0017-markdown-canonical-content-format.md)**, which
made Markdown the single canonical stored format for authored prose and explicitly rejected
both "WYSIWYG everywhere" and `tiptap-markdown` as the canonical input. ADR-0017's reasoning
stands for the app at large — agent-authorability, diffability, portability, no XSS surface.
But it weighed "the nicest WYSIWYG UX" as a *global* default and found it not worth the
cost. It did not consider a feature whose **core requirement** is anchored annotation, which
Markdown structurally cannot support.

Tiptap v2.11 (`@tiptap/react`, `starter-kit`, `extension-highlight`, …) is already a
dependency. There is no Yjs/Hocuspocus (no realtime collab infra) and no Tiptap Pro
(no paid Comments extension).

## Decision

**On the Feature (PRD) detail page only, the body becomes a node-addressable rich document
backed by ProseMirror/Tiptap, to enable anchored comments. This is a deliberate, scoped
exception to ADR-0017 — not a repo-wide reversal.** Everywhere else, ADR-0017 is unchanged:
prose is Markdown, authored via `MarkdownInput`, displayed via `MarkdownRenderer`.

1. **Storage — dual representation, JSON canonical.**
   - Add `Feature.descriptionDoc Json?` — the ProseMirror document (with inline comment
     marks). **This is the source of truth** the editor reads and writes.
   - Keep `Feature.description String?` as a **derived, write-only Markdown projection**,
     re-serialized from the doc on every save (via `tiptap-markdown`). It exists purely as a
     **machine interchange** for off-island readers — the CLI (`outputFeaturePretty/Json`),
     card/list previews, and agents/SDK — none of which can or should consume raw JSON.
   - The projection is **never read back into the editor**, so ADR-0017's lossy-round-trip
     objection to `tiptap-markdown` does not apply here: we serialize *out* one way only.
     Comment marks simply have no Markdown form and drop from the projection — fine, they
     are a view concern.

2. **Migration — lazy, per-feature, on first edit.** Existing features keep rendering from
   `description` until first opened in the editor, at which point Markdown → ProseMirror JSON
   runs once and `descriptionDoc` becomes canonical thereafter. Same shape as ADR-0017's
   convert-on-edit; no bulk prod rewrite.

3. **One editor component, `editable` toggled by permission.** A single Tiptap component
   **replaces `MarkdownRenderer` on this page** for both read and write. Viewers mount it
   `editable: false` so they still see highlights and can open/reply to threads; the writer
   mounts it `editable: true`. `MarkdownRenderer` stays everywhere else.

4. **Editor capability = "Tier B / Linear-grade":** selection bubble menu (bold, italic,
   link, code, headings, lists), `/` slash-command block menu, task lists, code blocks,
   image paste/drop (reusing the existing `action.uploadImage` storage path via a sibling
   `feature.uploadImage`), and placeholder text. Draggable blocks, tables, and AI
   "skills"-on-selection are explicitly **out of scope** (fast-follows).

5. **Anchored comments — mark in the doc, content in a table.**
   - A `comment` **mark** with a `threadId` attribute is applied to the selected range
     inside `descriptionDoc`; it moves with the text via ProseMirror position mapping.
   - Comment content lives in a new **`FeatureComment`** table keyed by `threadId`
     (`parentId` self-relation for threaded replies; `quotedText` snapshot so a thread whose
     marked text was deleted renders as an orphan rather than vanishing; `resolvedAt` for
     resolve/unresolve). Comment **bodies stay Markdown** authored via the existing
     `CommentInput` — so ADR-0017 still governs comment prose; the exception is only the
     *PRD body*. `threadId` is nullable to allow doc-level comments later.

6. **Collaboration — single-writer, multi-reader.** The body is edited by one person at a
   time with debounced autosave and an **optimistic-concurrency version check** (a stale tab
   is told to reload rather than clobbering a newer save). Anyone may read and comment at any
   time (comments are separate rows, never on the doc-save path). No Yjs/websockets;
   realtime co-editing is a later epic if the PoC proves out.

7. **Access — reuse the existing gate.** Both editing the body and commenting require
   **workspace membership**, via the same `loadFeatureWithAccess` resolver `feature.update`
   already uses. No new roles, no per-product membership, no restricted-PRD concept.

8. **Notifications — deferred.** Mentions render as styled text (free via `CommentInput`);
   wiring "you were mentioned on a PRD" into the notification system is a fast-follow.

## Considered alternatives

- **Document-level comment thread that quotes the selected text** (reuse `CommentInput`/
  `CommentThread`, no doc model change). Rejected as the target: the persistent highlight is
  the actual requirement; a quote is a dead snapshot, not a pinned annotation. Kept as the
  cheaper fallback if (b) had been rejected.
- **Keep Markdown canonical, anchor comments to character offsets.** Rejected: anchors drift
  or break on any edit above them — defeats the feature.
- **Drop the Markdown column, store only JSON.** Rejected: breaks the CLI, card previews,
  and agent/SDK readers, expanding the blast radius far past one page. The derived Markdown
  is cheap insurance and better UX for those text-consuming surfaces.
- **Adopt the rich editor app-wide (reverse ADR-0017).** Rejected: ADR-0017's
  agent-authorability and portability arguments remain correct for the other 99% of prose.
  This stays a contained island.
- **Realtime multiplayer (Yjs + Hocuspocus) now.** Rejected: a websocket server to deploy,
  auth, and operate — outside a one-page proof of concept. Single-writer + version check
  delivers safe editing and stable anchors without it.

## Consequences

- New `Feature.descriptionDoc Json?` column and a new `FeatureComment` model + tRPC router
  (mirroring `goalComment`'s access pattern).
- New dependency: `tiptap-markdown` (JSON → Markdown projection + one-time Markdown → JSON
  migration). A custom `comment` mark extension and a slash-command menu component.
- **Two representations of the PRD body coexist** (`descriptionDoc` canonical,
  `description` derived). The invariant — *JSON is source of truth, Markdown is written from
  it and never read back into the editor* — must hold; violating it reintroduces round-trip
  corruption.
- The Feature page no longer uses `MarkdownRenderer`; it mounts the Tiptap component in both
  modes. The ESLint guard from ADR-0017 must allow Tiptap on this page (scoped exception).
- A known limitation, deliberately not solved: there is no "comment-only reviewer" — edit
  and comment share the workspace-member gate, because the workspace model has no per-product
  roles. Per-PRD reviewer permissions would be a future ADR.
- This ADR **scopes**, but does not supersede, ADR-0017: Markdown remains canonical for all
  prose except the PRD body on this page.
