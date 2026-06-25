# Knowledge Pages — a first-class authored-document entity

## Status

Accepted — 2026-06-25

## Context

The app had no general place to **author** free-form documents. The existing surfaces are each scoped to something else: `Feature` (a Product's PRD body), `Note` (a daily-journal entry tied to a `Day`), `Resource` (ingested *external* content for RAG), and `Document` (an ingested *file* artefact — `s3Key`, ingestion status). None of them is "a doc I sit down and write."

The `Feature` editor (`PrdDocument`) is the nicest authoring experience in the app, and [ADR-0024](0024-prosemirror-json-for-rich-documents.md) already sanctions its ProseMirror-JSON-plus-Markdown-projection storage. The `KnowledgeChunk` semantic-search index is polymorphic and its `sourceType` already anticipates a `document`/page origin.

## Decision

Introduce **Page** (`KnowledgePage`) as a first-class authored-document entity.

- **Storage reuses the [ADR-0024](0024-prosemirror-json-for-rich-documents.md) pattern**: `bodyDoc: Json` (canonical ProseMirror) + `body: String` (derived Markdown projection) + `docVersion: Int`. This widens ADR-0024's exception from Features to Pages; ADR-0017 stays the default for ordinary prose.
- **Scope**: `workspaceId` (required) + optional `projectId`. Flat in v1 — no nesting; a self-referencing `parentId` tree is deferred.
- **Visibility mirrors Meeting visibility** (reuses the central access service, `src/server/services/access/`): a project-linked Page inherits its Project's visibility (restricted-project allowlist included); a project-less Page is workspace-visible and editable by non-viewers. No separate private/personal-page concept in v1.
- **Search**: the Markdown projection is embedded into `KnowledgeChunk` as `sourceType: "page"`, **default-on**, re-embedded on save after a settle delay (fire-and-forget, like transcription embedding), with a per-Page "include in search" toggle. Pages thus become Zoe/RAG context like Resources and Meetings.
- **UI**: a **top-level nav item** (`/w/[slug]/pages` list, `/w/[slug]/pages/[id]` editor) — its own destination, *not* a tab inside Knowledge Base — though it still feeds the shared Knowledge index, so it remains findable from Knowledge Base search.
- **Editor v1**: formatting, slash menu, task lists, image paste, debounced autosave, optimistic concurrency. **Anchored comments/threads are deferred** (the `CommentMark` extension may stay in the shared set, but the thread UI stays off for Pages).
- **Agent authoring**: Zoe can create/update Pages via a Mastra tool using draft-and-confirm, reusing the `page.create`/`page.update` tRPC through the `mastra.*` callback pattern ([ADR-0020](0020-agent-integration-callback-not-token.md), [ADR-0016](0016-agent-activity-writes-reuse-human-path.md)).

## Considered alternatives

- **Reuse the existing `Document` model.** Rejected — it's a file-ingestion artefact (`s3Key`, `ingestionStatus`) with the wrong shape and a name collision; authored prose is a different thing.
- **Markdown-only via `MarkdownInput` (full ADR-0017 compliance).** Rejected — loses the rich editor (slash menu, structure) that motivated the feature; the ADR-0024 pattern already preserves agent-readability via the projection.
- **A "Documents" tab inside Knowledge Base.** Considered and rejected in favour of a top-level nav item for prominence; search co-location is preserved regardless via the shared index.
- **Nesting/folders in v1.** Deferred — `parentId` is cheap to add later and not worth the tree-nav UI now.

## Consequences

- New `KnowledgePage` model + `page.*` tRPC router + a `mastra.*` callback endpoint + a `../mastra` tool.
- A new top-level nav entry in `WorkspaceTopNav`.
- `KnowledgeChunk.sourceType` gains a live `"page"` producer; `KnowledgeService` learns to embed/re-embed a Page from its Markdown projection.
- ADR-0024's exception now covers two entities; any third use must still clear the "needs node-addressable structure" bar.
