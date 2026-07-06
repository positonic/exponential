# Page nesting is the pageLink graph, not a parentId column

## Status

Accepted — 2026-07-06

Supersedes the "`parentId` is cheap to add later" deferral in [ADR-0033](0033-knowledge-pages.md); extends [ADR-0038](0038-page-public-publishing.md).

## Context

[ADR-0033](0033-knowledge-pages.md) shipped Knowledge Pages flat and deferred nesting, noting a self-referencing `parentId` tree was "cheap to add later." The follow-up work (#241 / chief.cricket) then delivered Notion-style sub-pages a different way — via **soft page-links**: a `pageLink` ProseMirror node ([`src/lib/prd/page-link.ts`](../../src/lib/prd/page-link.ts)) stored in a page's `bodyDoc`. A "sub-page" is simply any `KnowledgePage` whose id appears in a `pageLink` node in another page's body. The `/page` slash command creates the target in the same workspace+project (identical visibility) and drops the link at the cursor.

On that base, #241 also shipped: live-title links with rename propagation, published-only child links on public pages, batch publish over the link graph (`page.publishMany` / `linkedUnpublished`, BFS-capped at 50), and an in-app parent breadcrumb (`page.parentCrumb`) — a **reverse lookup** (`bodyDoc::text LIKE` prefilter → confirm via `collectPageLinkIds` → view-gate → newest-edited linker wins). There is no stored parent pointer.

The #244 follow-up (upper.elk) was scoped assuming the deferred `parentId` column would finally land, to power re-parenting, a tree UI, a public breadcrumb, and duplicate-with-sub-pages. That assumption needs resolving first: given the link graph already encodes the relationships, does a hard `parentId` still earn its place, or does it become a second, conflicting source of truth?

## Decision

**Do not add `parentId`. The `pageLink` graph is the single source of truth for page nesting.**

- **Structure is authored in the body.** A page's children are the `pageLink` nodes inside its own `bodyDoc`, in document order — `collectPageLinkIds(page.bodyDoc)`. Its parent is any page that links to it (reverse lookup; the newest-edited *viewable* linker wins when there are several, matching the already-shipped `parentCrumb`).
- **No schema change, no migration.** Every deferred #244 item is built on the existing graph and helpers:
  - *Child list on the editor* → `page.children` resolves `collectPageLinkIds(body)` to live `{id, title, isPublic}` (view-gated, order preserved).
  - *Tree on `/w/[slug]/pages`* → `page.tree` builds the link adjacency for the workspace server-side (roots = pages no viewable page links to) and returns a depth-flattened list.
  - *Public breadcrumb* → the `parentCrumb` reverse lookup, filtered to `isPublic` parents, rendered only when the parent is itself published ([ADR-0038](0038-page-public-publishing.md)).
  - *Duplicate-with-sub-pages* → BFS the link graph (`collectLinkedPages`), deep-copy the viewable/placeable reachable pages, remap old→new ids, rewrite the copied bodies' `pageLink` ids+hrefs; copies never inherit publish state.
- **Re-parenting is satisfied by construction, not new columns.** A subtree is defined by containment: moving the single link to page P does not touch P's body, so P's descendants travel with it automatically. Re-parenting moves a *navigation* link and never changes `projectId`/`workspaceId` — the #241 invariant that **parent is navigation, never an access boundary** holds. Placement changes remain a separate act, already gated by `assertCanPlacePage` in `page.update`. v1 exposes detach (delete the link) and relies on the editor's block cut/paste + `/page` for moves; no dedicated `page.reparent` server op.

## Considered alternatives

- **Authoritative `parentId` column (the ADR-0033 presumption).** Rejected — it duplicates a fact the body already owns, so the two can diverge: delete a link block and the column lingers (a ghost child); a page linked from two bodies has one `parentId` but two body-parents. Keeping the column in sync means policing every body save. This reverses #241's core choice for cheaper tree queries we have no evidence of needing.
- **Denormalized `parentId` cache** (recomputed on save as "the canonical linker"). Rejected for v1 — redundant with `parentCrumb`, must be invalidated across pages on every body save, and buys only query speed. It can be added later as a pure optimization without changing semantics.

## Consequences

- `KnowledgePage` is unchanged; #244 ships with **no Prisma migration**.
- `page.children` and `page.tree` load `bodyDoc`s to derive adjacency. Fine at the current pages-per-workspace scale. If it ever bites, the escape hatch is a denormalized `linkedPageIds String[]` maintained on save — an optimization, not a redesign.
- "The" parent/breadcrumb is inherently the newest-edited viewable linker, not a hard canonical pointer. This is already the shipped behavior; the public breadcrumb and any future tree that needs *a* path inherit the same tie-break, and a page reachable from two parents legitimately appears under both.
- Duplicate-with-sub-pages is the only genuinely new graph mutation; it stays within the workspace-scoped, cycle-safe, 50-page BFS `collectLinkedPages` already established for batch publish.
