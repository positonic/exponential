# Pages publish to the web via an immutable short id, live content, noindex default

## Status

Accepted — 2026-07-05

## Context

Knowledge Pages ([ADR-0033](0033-knowledge-pages.md)) are workspace-internal: every `page.*` procedure is protected, and visibility mirrors Meeting visibility via the central access service. Users want to share a finished Page with the outside world (a spec, a public doc, a post) the way Notion's "Publish to web" does.

The only existing public-content precedent is Forms ([ADR-0029](0029-generic-forms-subsystem.md)): a bare `(public)` route group and a **globally-unique slug** resolved alone at `/f/[slug]`. That scheme fits Forms (few, deliberately named) but not Pages: page titles collide constantly, users will want to rename slugs without breaking shared links, and a global slug namespace invites squatting.

Publishing also cuts across the ADR-0033 visibility model — a Page inheriting a *restricted* Project's allowlist can be made world-readable by one member.

## Decision

- **URL scheme**: `/p/{publicSlug}-{publicId}`. The `publicId` (8-char lowercase-alphanumeric, minted at first publish, `@unique`, immutable) **alone resolves the page**. The `publicSlug` is cosmetic: auto-slugified from the title, freely editable, no uniqueness constraint. A request with a stale slug permanently redirects (HTTP 308 via Next's `permanentRedirect`) to the canonical URL.
- **Live content, not a snapshot**: the public route renders the current `bodyDoc`. Unpublish (`isPublic = false`) → immediate 404; republish reuses the same `publicId`, so previously shared links revive.
- **Publish gate = edit access on the Page** (`ensurePageAccess "edit"`), with no extra role gate and **no carve-out for restricted-project Pages** — the share popover states the consequence plainly. Publishing is an explicit per-page act; it never follows from visibility rules.
- **noindex by default**: robots meta is `noindex` unless the per-page `publicSeoIndexed` opt-in is set; only opted-in pages enter `sitemap.ts`.
- **Server-rendered HTML from the canonical doc**: the public route runs `generateHTML` (`@tiptap/html`) over `bodyDoc` with the shared extension set, after a sanitization pass that strips non-`http(s)`/`mailto` link hrefs and non-`http(s)` image srcs; comment marks render inert. Pages with only a legacy Markdown `body` fall back to `MarkdownRenderer`. This uses `dangerouslySetInnerHTML` on server-sanitized, schema-constrained output — a deliberate, narrow exception to the CONTENT_RENDERING rule, confined to this route (the rule targets untrusted prose paths; this is the ADR-0024 rich-document surface, where the Markdown projection is lossy).
- **Public chrome**: title, byline (author name, workspace name, updated date), a very visible light/dark toggle (defaults to the visitor's system preference), and a "Published with Exponential" footer. The published route group has its own root layout — the Forms layout stays hard-dark.
- **Duplication** (shipped alongside): requires **view** access on the source; the copy keeps the source's placement (`projectId`/`workspaceId`, hence identical visibility), is owned by the duplicator, titled "{title} (copy)", and **never inherits publish state**.

## Considered alternatives

- **Forms-style globally-unique slug, no id.** Rejected — title collisions force `-2` suffixes; slug edits break shared links or require redirect bookkeeping; squattable.
- **`/p/{shortId}` only.** Rejected — drops the readable, user-editable slug requirement.
- **Snapshot-on-publish.** Rejected for v1 — doubles storage and adds a "pending changes" state machine; an explicit "publish changes" mode can be layered on later without changing the URL scheme.
- **Owner/admin-only publishing, or blocking restricted-project Pages.** Rejected for v1 — friction outweighs the risk given the explicit popover; revisit if abuse shows up.
- **Read-only Tiptap client render.** Rejected — ships the editor bundle to anonymous visitors and weakens SEO on a marketing-adjacent surface.

## Consequences

- `KnowledgePage` gains `isPublic`, `publicId @unique`, `publicSlug`, `publicSeoIndexed`, `publishedAt`.
- New public route group with its own root layout at `/p/[slugId]`; the first place the app serves authored workspace content unauthenticated.
- `page.publish` / `page.unpublish` / `page.updatePublicSettings` / `page.duplicate` mutations.
- Sub-pages (deferred by ADR-0033) remain compatible by construction: URLs are flat, publishing is per-page, so a tree adds navigation (breadcrumbs/child links rendered only when the target is itself published) without touching this scheme.
