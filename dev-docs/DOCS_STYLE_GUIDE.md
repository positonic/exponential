# Docs style guide

How to write and maintain the user docs at `/docs` (source: `content/docs/`). Every page,
whether a human or an agent writes it, follows this guide and the
[page template](DOCS_PAGE_TEMPLATE.md). Background: `DOCS_AUDIT_2026-09.md`.

## Who the docs are for

Someone who has just signed up and wants to get something done, and an agent that has been
pointed at the docs to learn the product. Neither is a developer of Exponential. If a sentence
only helps someone running the code, it belongs in `dev-docs/`, not here.

## Vocabulary

Use the product's own words, exactly as [`CONTEXT.md`](../CONTEXT.md) defines them.

| Write | Never | Why |
|---|---|---|
| Action | task, todo, to-do | The user-facing word is always "Action". |
| Zoe | Paddy, "the AI", "the bot" | Zoe is the assistant's name in the product. |
| Meeting | transcription, session, call | A meeting is the recorded conversation. |
| Scheduled meeting | event, booking | A future calendar booking. |
| Ceremony / Occurrence | ritual, recurring meeting | Definition vs one instance. |
| Workspace | team space, org, tenant | |
| Product, Ticket, Feature, Scope, Cycle | sprint (except in "cycles & sprints" headings), issue, story | Product Management plugin terms. |
| Decision | ADR (unless talking about the ADR sync) | |
| External agent | bot, integration user | See the External Agents page. |
| Sidebar sections: Align, Deliver, Connect, Amplify | "menu", "nav" | Match `NAV_ITEM_CONFIG` labels exactly. |

Capitalise product objects when naming the concept ("an Action", "the Decision Log") and
sidebar or button labels exactly as the UI shows them, in bold: **Today**, **Add meeting**.

## Voice

- Second person, present tense, active voice: "Open Today and drag an action into the plan."
- Short sentences. One idea each. No throat-clearing ("In this section we will…").
- Be concrete and honest: say what the feature does today, including limits. The Time
  Tracking page is the reference for tone.
- No generic productivity advice. A "Tips" section may hold two or three product-specific
  tips; never a "Best practices" essay.
- No marketing adjectives ("powerful", "seamless", "intelligent").
- Expand an acronym the first time it appears on a page (OKR, CRM, MCP, CLI).

## What never goes in a user page

- Implementation details: enum values (`BACKLOG`, `IN_REVIEW`), database fields
  (`completedAt`), config flags (`doMindset`), model or vector details (pgvector, embedding
  sizes), internal tool names, tRPC procedure names.
- Environment variables, `.env` files, "restart the service", Mastra, gateway URLs,
  `AUTH_SECRET`. Self-hosting material lives under the Self-hosting section only.
- Absolute `exponential.im` URLs. Links are relative (`/today`, `/settings/api-keys`) so
  they work on previews, staging and sovereign installs. The CI check rejects absolute
  self-links.
- Claims about where something lives that you have not verified in the running app.
  "**Habits** in the sidebar" fails CI unless Habits is actually a sidebar item.

## Links

- Docs pages: `/docs/<path>` with an optional `#anchor` that matches an H2/H3 on the target.
- App routes: relative, workspace-agnostic where one exists (`/today`, `/inbox`, `/time`,
  `/journal`, `/settings/...`, `/teams`, `/workspaces`, `/meetings`, `/agent`). For
  workspace-scoped routes use `/go/<route>`: `[**Connect → CRM**](/go/crm) in the sidebar`,
  `[workspace settings → **Plugins**](/go/settings/plugins)`. `/go` opens the reader's default
  (or Personal) workspace, and sends signed-out readers through sign-in first. `docs:check`
  fails on a `/go/` target that is not a folder under `src/app/(sidemenu)/w/[workspaceSlug]/`.
- Images: `/doc-assets/<name>.png`, checked into `public/doc-assets/`. Alt text describes
  what the reader sees. Screenshots come from the `dev-fixture` workspace
  (`npm run dev:seed-fixture`, see `AGENT_VISUAL_TESTING.md`), never from a personal account.
- Link the first mention of another concept to its page; do not link the same page twice in
  one section.

## Page shape

Follow [`DOCS_PAGE_TEMPLATE.md`](DOCS_PAGE_TEMPLATE.md):

1. Frontmatter (`title`, one-line `description`, `section`, `order`, `icon`).
2. **What it is** — two or three sentences and one screenshot.
3. **Where to find it** — the linked route or the exact sidebar path.
4. **How to …** — one task per H3, numbered steps, one screenshot where the UI is not obvious.
5. **How it connects** — links to related concepts.
6. **FAQ / Troubleshooting** — real questions, short answers.

Headings are sentence case ("How to add a meeting"), H2 for sections, H3 for tasks. The
right-hand table of contents is built from H2/H3, so keep them descriptive. Never skip levels.

## Frontmatter and the sidebar

The sidebar is derived from frontmatter; there is no hand-maintained list.

```yaml
---
title: Time tracking            # page title and default sidebar label
description: One sentence …     # under the title, in search results, in <meta>
section: do                     # id from content/docs/_meta.json; default: top-level folder
order: 5                        # position in the section; unordered pages sort last, A–Z
icon: IconClock                 # a name from src/lib/docs/icons.ts (optional)
sidebarTitle: Time              # shorter sidebar label (optional)
parent: /docs/features/crm      # nest under another page, one level (optional)
hidden: true                    # keep the URL, hide from sidebar and search (optional)
updated: 2026-09-28             # "Last updated" date; stamped by the pre-commit hook
---
```

Sections and their order live in `content/docs/_meta.json`. Files and folders that start with
`_` are ignored by the site. Old URLs must keep working: when a page moves, leave a redirect.

## Checks before you open a PR

```bash
npm run docs:check     # links, anchors, assets, sidebar labels, frontmatter, last-updated
npm run check          # lint + typecheck (if you touched the renderer)
```

`docs:check` also runs in CI (`Docs links & labels`). Every page carries an `updated: YYYY-MM-DD`
frontmatter field, which the pre-commit hook stamps whenever the page is staged; you never need to
edit it by hand. If CI says a page is missing it (a new page committed with `--no-verify` or from
the GitHub editor), run `npm run docs:last-updated` and commit the result.

Verify layout changes in the browser at 375px, 768px and 1440px. Verify every claim about the
UI against the running app before writing it down. Add "Docs updated?" to the PR description
(the template asks for it).
