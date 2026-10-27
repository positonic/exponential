# Page history is a snapshot per editing session; pages carry `source` and `asOf`

## Status

Accepted — 2026-10-27. Extends [ADR-0033](0033-knowledge-pages.md) (Pages) and is the first
field-level history under [ADR-0071](0071-agent-principles-fixed-invariants.md)'s *change
integrity* principle ("keep attribution and history").

## Context

Strategy, vision and company-fact pages changed with no record of what changed or why. The only
trace was `docVersion` ticking up and `updatedAt` moving. In git every edit is a reviewable diff;
a reader of a Page could not tell whether a number was updated last week by a person or rewritten
last night by an agent, nor get the old text back. Separately, agents fetching a page received
both the ProseMirror doc and its Markdown projection — 100–500 KB for a long page — and had no way
to ask "which pages are *about* X" except by title substring, although the Markdown projection has
been embedded into the Knowledge index since ADR-0033. And a page stating company facts had no
place to say where the facts came from or when they were true.

## Decision

1. **`KnowledgePageRevision` is a snapshot of the page after a write** — title, Markdown `body`,
   `bodyDoc`, `docVersion`, `kind` (`create` | `editor` | `markdown` | `restore`), `authorId` and
   an optional free-text `note` ("why"). Every write path records one in the same transaction:
   `page.create`, both `page.update` paths, renames, `page.duplicate`, `page.restore`.
2. **Editor autosaves fold.** An `editor` write by the same author within 10 minutes of the latest
   `editor` revision moves that row forward instead of inserting (`updatedAt` advances). A revision
   is therefore an editing session, not a keystroke. Markdown-source writes (CLI, MCP, agents),
   restores, creates and any write carrying a `note` never fold — each is one deliberate change.
3. **Diffs are computed, not stored.** `page.diff` renders a unified diff of two snapshots'
   Markdown (default: a revision against the one before it). `page.restore` writes a revision's
   content back as a new forward write — compare-and-set on `docVersion`, recording a `restore`
   revision — so history never rewinds.
4. **Lean reads.** `page.get` takes `format: full | markdown | outline` and `section`. The editor
   keeps `full`; every agent surface (SDK, CLI, MCP) defaults to `markdown`, which omits `bodyDoc`.
   `bodyBytes` is always reported so a caller can budget before fetching.
5. **Search by meaning.** `page.search` returns semantic hits from the Knowledge index
   (`sourceType = "page"`, scoped by the page access rule, never by chunk author) followed by
   substring matches the index missed. `search.knowledge` gains a `sourceTypes` filter.
6. **Provenance fields.** `KnowledgePage.source` (free text: a URL, a document, a person) and
   `asOf` (the date the facts were true). Editable from the page details, the CLI and agents;
   shown under the title when set.

## Rejected

- **Deltas instead of snapshots.** Smaller, but every read of an old version replays the chain, a
  corrupt delta poisons everything after it, and restore becomes a computation rather than a copy.
  Storage is cheap next to a page's own `bodyDoc`; folding bounds the row count.
- **A revision per autosave.** Faithful, unreadable: a half-hour of typing is hundreds of rows.
- **Snapshotting Markdown only.** Restores would re-derive the doc from Markdown and lose
  anything Markdown cannot express. The doc is kept but never returned by `history` or `revision`.
- **A separate `page.getMarkdown` procedure.** One procedure with a `format` keeps access,
  includes and the `canEdit` flag in one place.
- **Typed provenance (`sourceUrl`, `sourceKind`).** A URL is one kind of source; "the finance
  team, verbally" is another. Free text with a date covers both without a taxonomy nobody asked for.

## Consequences

- New table, two nullable columns; one baseline `create` revision seeded per existing page.
- `page.get` from the SDK now returns no `bodyDoc`; editor-only consumers must pass
  `format: "full"`.
- The audit matrix (`dev-docs/AGENT_PRINCIPLES_AUDIT.md`) History row moves from `gap` to
  `partial`: Pages have attributed, restorable history; features, decisions and others still do not.
- Retention is unbounded for now; a cap or compaction of old `editor` rows is a follow-up if row
  counts or storage surprise us.

## Amendment 2026-10-27: stale writes merge, conflicts keep both sides

History made a clobbered page recoverable; this amendment makes clobbering rare.

- **A stale Markdown write is merged, not refused.** `page.update` with a `baseVersion` behind
  the stored `docVersion` loads the revision at that base and three-way merges base → stored →
  incoming on lines (`src/lib/pages/three-way-merge.ts`). Changes to different lines land as one
  `markdown` revision noted "Merged over v<N>", written compare-and-set at the stored version.
  Changes to the same or adjacent lines throw CONFLICT with `reason: "overlap"`, the hunks and
  the current body (`data.conflict.current.body`), so an agent reconciles without a re-read.
  No revision at the base (a folded editing session moved past it) is a plain `stale` conflict.
- **The editor offers "Keep my version".** On a conflict the tab can reload (as before) or save
  its content over the newer version as an `editor` revision noted "Kept over v<N>". Nothing is
  lost either way: the overridden version is one row back in history.
- **An open editing session refuses Markdown writes.** A Markdown write by a different author
  while someone's `editor` revision was touched inside the fold window throws CONFLICT with
  `reason: "editing"` and who is editing. `force: true` writes anyway; agents pass it only after
  the person says so.
- **Unguarded writes are visible.** A Markdown body write without `baseVersion` still lands,
  and its revision is noted "Unguarded write" (appended to the caller's note when there is one).
  Requiring the base from agents is the Phase 3 ticket `happy.cliff`.

Rejected: merging ProseMirror docs (the Markdown projection is what every non-editor writer sends,
and a line merge of it is what people expect from git); storing the losing side of an editor
conflict as a revision of its own (a revision is a snapshot of the page, and the page never held
that text — "Keep my version" gives the same guarantee without bending the model).

