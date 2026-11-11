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
   `bodyDoc`, provenance (`source`, `asOf`), `docVersion`, `kind` (`baseline` | `create` |
   `editor` | `markdown` | `restore`), `authorId` and an optional free-text `note` ("why"). A
   change to title, body or provenance records one, in the same transaction, on every write path:
   `page.create`, both `page.update` paths, renames, provenance edits, `page.duplicate` (after its
   links are re-pointed at the copies), `page.restore`, and the automated writers — ceremony notes
   pages and their agenda seed and meeting summary, Workspace update drafts, regenerations and the
   Updates index. An automated write names no author; its `note` says what wrote it. Re-sending
   stored values records nothing. Moving the page or toggling search inclusion does not record one —
   that is placement, already in the activity feed. Each row stores its body's size, so listing
   history never reads bodies.
2. **Editor autosaves fold.** An `editor` write by the same author within 10 minutes of the latest
   `editor` revision moves that row forward instead of inserting (`updatedAt` advances). A revision
   is therefore an editing session, not a keystroke. `editor` means the person in the app; any
   write from outside it — CLI, MCP, agents, automated writers, whether body, title or provenance —
   is `markdown` and never folds. Restores, creates and any write carrying a `note` never fold
   either — each is one deliberate change.
3. **Diffs are computed, not stored.** `page.diff` renders a unified diff of two snapshots'
   Markdown (default: a revision against the one before it) and flags title and provenance
   changes; it can also compare a revision with the page as it is now, or with any other revision.
   `page.restore` writes a revision's *whole* snapshot back — title, body, provenance — as a new
   forward write, recording a `restore` revision, so history never rewinds. It is a
   compare-and-set on the `docVersion` the caller saw (`baseVersion`; the History panel sends the
   version it showed), so a page saved since then is a CONFLICT, not silently replaced.
3a. **History follows view access; names follow membership.** Anyone who can view the page can
   read its history and diffs. Authors are named only to workspace members, the same rule the
   Share popover's audience roster applies, so a project-only collaborator sees "A member".
3b. **Pages that predate history get one unattributed `baseline` row** at their `updatedAt`:
   the content as it stood, no author. The creator did not necessarily write the current text,
   and claiming so would present an interpretation as a fact (ADR-0071).
4. **Lean reads.** `page.get` takes `format: full | markdown | outline` and `section`. The
   procedure defaults to `full` for the editor; every agent surface (SDK, CLI, MCP) defaults to
   `markdown`, which omits `bodyDoc`. `bodyBytes` is always reported so a caller can budget before
   fetching. `page.list` returns `docVersion`, `source` and `asOf`, so an agent can pick a
   `baseVersion` and judge freshness without fetching bodies; its `search` stays a title match.
5. **Search by meaning.** `page.search` returns semantic hits from the Knowledge index
   (`sourceType = "page"`, scoped by the page access rule, never by chunk author or workspace
   membership, so a project-only collaborator searches the pages they can view) followed by
   substring matches the index missed. `search.knowledge` gains a `sourceTypes` filter and stops
   narrowing to chunks the caller authored: the per-source viewer rules were already enforced
   inside the search, so the author filter only hid teammates' meetings and pages — from the
   command palette too. Resources (the Reading list) stay visible to their owner only, by their
   own rule; uploaded documents are left out by default because they have no page to link to.
6. **Provenance fields.** `KnowledgePage.source` (free text: a URL, a document, a person) and
   `asOf` (the date the facts were true). Editable from the page details, the CLI and agents;
   shown under the title when set, with an "Add source / as-of" prompt for editors when not.

## Rejected

- **Deltas instead of snapshots.** Smaller, but every read of an old version replays the chain, a
  corrupt delta poisons everything after it, and restore becomes a computation rather than a copy.
  Storage is cheap next to a page's own `bodyDoc`; folding bounds the row count.
- **A revision per autosave.** Faithful, unreadable: a half-hour of typing is hundreds of rows.
- **Snapshotting Markdown only.** Restores would re-derive the doc from Markdown and lose
  anything Markdown cannot express. The doc is kept but never returned by `history` or `revision`.
- **A separate `page.getMarkdown` procedure.** One procedure with a `format` keeps access,
  includes and the `canEdit` flag in one place.
- **Typed provenance (`sourceUrl`, `sourceKind`), or many sources per page.** A URL is one kind
  of source; "the finance team, verbally" is another. Free text with a date covers both without a
  taxonomy nobody asked for; a page with several inputs cites them in its body.
- **Requiring a `note` on agent writes.** Right in principle, but it breaks Zoe's page tool until
  the mastra repo sends one. For now agent rows without a note read "No reason given" and the tool
  descriptions push for one; it becomes required in the step that also requires `baseVersion`.
- **Attributing the baseline to the page creator.** Reads naturally and is sometimes false.

## Consequences

- New table, two nullable page columns; one unattributed `baseline` revision seeded per existing
  page. Two migrations: the second (provenance and size on revisions, baseline rows made honest)
  is additive and safe on a database that already ran the first.
- `page.get` from the SDK now returns no `bodyDoc`; editor-only consumers must pass
  `format: "full"`.
- The audit matrix (`dev-docs/AGENT_PRINCIPLES_AUDIT.md`) History row moves from `gap` to
  `partial`: Pages have attributed, restorable history; features, decisions and others still do not.
- Retention is unbounded, rich document included, by decision: deleting history is the one thing
  that cannot be undone, and pages are small next to transcripts and embeddings. Compaction of old
  `editor` rows' `bodyDoc` is the follow-up if storage surprises us.
- The SDK's `pages.get` returns Markdown only by default from 1.24.0 — a deliberate breaking change
  so agents get the small payload without knowing the option.
