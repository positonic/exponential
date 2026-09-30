# User docs audit — exponential.im/docs

Date: 2026-09-28. Scope: everything under `content/docs/` (37 pages, ~6,660 lines), the docs
renderer (`src/lib/docs/`, `src/app/_components/docs/`), and the live site at
https://www.exponential.im/docs. Checked against the real app routes, the sidebar config in
`src/lib/navLayout.ts`, the settings tabs, the plugin registry, and `CONTEXT.md`.

Baseline facts worth knowing before reading the findings:

- All 37 pages are Markdown with frontmatter; the sidebar is a hand-maintained list in
  `src/lib/docs/navigation.ts` (frontmatter `order`/`icon` are read but never used).
- Every internal docs link and every `#anchor` resolves (I checked all of them). Zero broken links.
- The site loads with no console errors. There is no search.
- The mobile layout is broken: the sidebar is a fixed 256px column, so on a 375px phone the
  article is squeezed into a ~60px strip (screenshot in the session).
- Pages were written between 2025-12-29 and 2026-09-16. Twelve pages have never been edited
  since they were created; the sidebar description of the app predates the current navigation.

---

## Pass 1 — A first-time user: do the docs explain what Exponential is and how it works?

**Verdict: no.** A newcomer leaves the Introduction knowing it is "an AI-powered productivity
platform" that has projects, actions and goals. That describes Todoist. Nothing on the front
door says what is different: meetings become actions and decisions, an assistant (Zoe) that acts
across your data, external agents as team members, products and tickets for product teams.

Specific problems:

1. **The positioning sentence is generic.** `content/docs/index.md` opens with "Organize projects,
   track tasks, achieve goals, and work smarter with intelligent assistance." The repo's own
   `CONTEXT.md` has a much sharper one-liner: "Productivity OS that turns meeting transcripts into
   projects, actions, and decisions." The docs never say this.

2. **There is no concept model.** The objects a user must understand (Workspace, Product, Project,
   Action, Goal and Key Result, Meeting, Decision, Ceremony, Page, Ticket, Plugin, Zoe, Agent) are
   never introduced together. "Core Concepts" is a four-paragraph section buried at the bottom of
   the Quickstart, and it only covers Projects vs Actions, Goals, and Workspaces.

3. **The Quickstart describes an app that no longer exists.** It tells the user the sidebar has
   Home, Inbox, Today, Upcoming, Projects, Goals, Journal. The real sidebar is Inbox, Today, Time,
   then four sections: Align (Goals, Decisions), Deliver (Actions, Projects, Products, Metrics,
   Pages), Connect (CRM), Amplify (Agents, Meetings, Knowledge). A new user following the
   Quickstart will look for "Upcoming" and "Journal" and not find them.

4. **The assistant has two names.** Fourteen pages call the assistant "Paddy" (18 mentions); the
   product, the command palette ("Ask Zoe") and the External Agents page call it "Zoe". The Slack
   page lists both as separate agents. A newcomer cannot tell what they are talking to.

5. **No pictures.** The whole docs set has three images (two for the iOS shortcut, one Fireflies
   diagram). The product is visual: kanban boards, the wheel, timelines, the day-view time chart.
   None are shown.

6. **Routes the docs send people to are not where the docs say.** "Navigate to Habits from the
   sidebar", "Startup Routine from the sidebar", "Wind-Down from the sidebar", "Tokens in the
   sidebar" (five pages), "Agent in the sidebar". None of these is in the sidebar. Habits,
   Startup Routine, Wind-Down and Upcoming have no link anywhere in the UI; they are only
   reachable by typing the URL. Tokens live at Settings → API keys.

7. **Sign-up options may be wrong.** Docs say Google, Discord, Notion. The auth config also has
   an email (magic-link) provider and a `/auth/verify-request` page the docs never mention.
   Worth checking the sign-in page and matching the docs to it.

8. **Self-hosting instructions leak into user docs.** The Slack page tells the reader to put a bot
   token in "your Mastra environment (`.env`)" and restart the service. The WhatsApp page talks
   about `WHATSAPP_GATEWAY_URL` and `AUTH_SECRET`. A SaaS user cannot do any of this, and it makes
   the product look like a developer toolkit.

## Pass 2 — Is the structure well thought out and consistent with best practice?

**Verdict: the sidebar is the chaos.** Three sections: GET STARTED (4 pages), FEATURES (28 pages
in one flat list in no discernible order), PLUGINS (4 pages). The Features overview page
(`features/index.md`) actually groups things sensibly (Core, Reflection, Collaboration, AI,
Integrations, Plugins, Customisation) but the sidebar ignores that grouping, and the Prev/Next
footer walks the flat list, so "Actions → Goals → Inbox & Today → Daily Journal → Time Tracking"
is the reading order.

Measured against the usual reference model (Diátaxis: tutorials, how-to guides, reference,
explanation) and against docs people admire (Linear, Stripe, Notion, Height):

1. **Genres are mixed inside "Features".** Integrations (Slack, WhatsApp, Fireflies, Notion),
   capture clients (iOS Shortcut, Chrome Extension), developer material (API Access, External
   Agents), settings, and two pages that both describe the Workflows page ("Workflows" and
   "Integrations") all sit as peers of Projects and Goals.

2. **Heavy duplication.** Fireflies setup is written out in four places (fireflies, workflows,
   integrations, api-access). Sidebar customisation is in settings and configuration. Plugin
   management is in plugins, configuration and workspaces. The rich-text formatting tables
   appear in journal and routines. The ten life domains appear in goals and wheel-of-life. The
   kanban columns appear in projects, actions and notion-sync. Each copy drifts independently.

3. **Roughly a third of the word count is generic productivity advice, not product
   documentation.** Every page ends with a "Best Practices" block: "Start small (2 minutes)",
   "Never miss twice in a row", "Rate energy on a 1-10 scale", "Friday afternoon or Sunday
   evening, 30-60 minutes". Some of this is good brand voice, but it buries the parts that
   explain the product and it is what makes the pages feel long and samey.

4. **Internal implementation leaks.** Routines documents `doMindset` / `doConsider` config
   flags. Journal documents the database note-type enum (`energy-reflection`,
   `learning-growth`). Actions documents `BACKLOG` / `IN_REVIEW` enum values and `completedAt`.
   Knowledge Base ends with "pgvector, text-embedding-3-small, 1536 dimensions". Slack lists the
   internal tool names (`getSlackChannelHistoryTool`). None of this helps a user.

5. **Three different voices.** Most pages are a neutral how-to. Slack is a blog post ("Productivity
   Daemon", "The Real Talk"). Time Tracking (the newest page) is the best-written page in the set:
   concrete, honest, FAQ at the end, real CLI examples. That page should be the template.

6. **Naming is inconsistent with the product's own vocabulary.** The nav says "Actions & Tasks"
   and the pages say "task" throughout; `CONTEXT.md` says the user-facing word is always
   "Action", never "task". Page titles and sidebar labels disagree ("Fireflies Workflow" vs
   "Fireflies", "WhatsApp Integration" at `whatsapp-gateway`, "Routines" vs "Startup & Wind-Down
   Routines", "Notion Sync & Kanban Mapping").

7. **Orphans and misplacements.** Epics has a page but is not in the sidebar. Notifications is the
   last item under Features. Time Tracking sits between Journal and Weekly Plan. Settings
   describes the old "Projects / Alignment / Teams / Tools" section model including items like
   "AI Sales Demo" and "Media".

8. **Missing docs-site furniture.** No search, no mobile navigation, no "last updated", no "edit
   this page", no landing cards, no per-page feedback, no `llms.txt`. The sidebar cannot nest
   (the code supports `children` but nothing uses it).

### Coverage: what the product has that the docs do not

This is the biggest gap. Routes and features with **no page at all**:

| Area | Surfaces in the app | Docs today |
|---|---|---|
| Products plugin | Products, Tickets, Features & scopes, Cycles, Epics, Retrospectives, Research, Problems, Insights, Roadmap, product settings, Metrics | Nothing. Plugins page lists only OKRs and CRM; the registry has a third plugin, "Product Management" (off by default) |
| Pages | `/w/{slug}/pages` in the default sidebar | Nothing |
| Decisions | Decision Log, decision graph, ADR sync, Settings → Decisions | Nothing (a large chunk of `CONTEXT.md` exists to seed this) |
| Meetings | Meetings page, manual transcripts, participants, meeting → actions/decisions, Add Meeting | Only via the Fireflies page |
| Ceremonies & occurrences | Settings → Ceremonies, occurrence pages, agendas, notes pages | Nothing |
| Calendar & scheduled meetings | `/calendar`, schedule-meeting flow | Nothing |
| Daily plan | `/daily-plan`, `/plan`, "Plan my day" | Nothing |
| CRM beyond contacts | Pipeline & deals, Lists, Automations, Forms, Broadcasts, smart merge | Lists/Pipelines/Automations page exists; Forms, Broadcasts, Pipeline settings, deals do not. The Lists page links "Broadcast" to the Workflows page, which never mentions broadcasts |
| Activity, Views, Timeline, Favourites, Command palette (⌘K) | all in the app | Nothing |
| Desktop app, Local wiki | Tauri shell | Nothing |
| CLI, MCP server, SDK | `exponential` CLI has ~25 command groups; `exponential-mcp` | CLI appears only inside Time Tracking |
| Chat gateways | WhatsApp, Telegram, Matrix (all listed as action sources) | WhatsApp only |
| GitHub, Google Calendar/Gmail, Monday.com | routes and integrations exist | Mentioned in passing, no setup page |
| Workspace admin | invites, guest role, restricted projects, weekly team check-in, OKR check-in | Partially in Workspaces/Teams; restricted projects and guests absent |
| Onboarding, public project pages, bounties | `/onboarding`, `/p/`, `/f/`, `/explore` | Nothing |

And material that is **stale** (describes a previous version of the product): the sidebar
model in Settings and Configuration, "Tokens in the sidebar", "Agent in the sidebar", "Paddy",
the WhatsApp page's "ManyChat interface" reference, the Weekly Plan "Team Reviews" and
"One-on-One Board" sections, the project tab list (Overview / Tasks / Goals / Timeline /
Workflows / Transcriptions), the Integrations "Coming Soon" table.

## Pass 3 — Does each page link to the app section it describes?

**Verdict: almost never.** Across 37 pages there are four links into the app:
`exponential.im/time`, `exponential.im/agent`, `exponential.im/settings/api-keys` (twice), and
one path template `/w/{your-workspace}/knowledge-base` on the Knowledge Base page. Everything
else is "Navigate to **X** in the sidebar". The two absolute hosts also disagree (`exponential.im`
vs `www.exponential.im`).

What can be linked today without knowing the workspace slug (workspace-agnostic routes):

- Daily: `/inbox`, `/today`, `/upcoming`, `/time`, `/home`, `/daily-plan`, `/calendar`, `/activity`
- Reflection: `/journal`, `/days`, `/habits`, `/weekly-plan`, `/weekly-plan/history`,
  `/wheel-of-life`, `/startup-routine`, `/wind-down`
- Account: `/settings`, `/settings/profile`, `/settings/appearance`, `/settings/notifications`,
  `/settings/integrations`, `/settings/api-keys`, `/settings/assistant`, `/settings/ai-history`,
  `/settings/ai-tools`, `/settings/agents`
- Other: `/teams`, `/workspaces`, `/workspaces/new`, `/workflows`, `/meetings`, `/agent`,
  `/knowledge-base`, `/goals`, `/projects`, `/actions` (the last three show all workspaces)

What needs a slug: `/w/{slug}/goals`, `decisions`, `actions`, `projects`, `products/...`,
`metrics`, `pages`, `crm/...`, `agent`, `meetings`, `knowledge-base`, `settings`,
`settings/plugins`, `settings/ceremonies`, `settings/decisions`, `weekly-plan`, `okrs`,
`okr-checkin`, `timeline`, `views`, `activity`, `home`.

Recommendation, in two layers:

1. **Link every workspace-agnostic route now.** Every "Navigate to **Today**" becomes
   "Open [Today](/today)". Use relative links, never absolute (`NEXT_PUBLIC_APP_URL` is unset in
   production, and relative links work on staging and self-hosted installs too). The docs are
   rendered inside the app shell when signed in, so these links land the reader directly in the
   feature.

2. **Add a `/go/<route>` resolver for workspace-scoped pages.** `/go/goals` resolves the user's
   last-used workspace (fall back to the Personal workspace every user has) and redirects to
   `/w/{slug}/goals`; signed out, it redirects to `/signin?callbackUrl=/go/goals` so the link
   still works after login. This satisfies "agnostic to workspaces" for every page, and the
   same links work from emails, Slack messages, the daily summary and CLI help text. It is a
   single Next.js route plus a lookup, a small change. Until it exists, the docs can use the
   `/w/{your-workspace}/...` template the Knowledge Base page already uses, but only as a stopgap.

## Pass 4 — Everything else

- **Docs need to serve agents as well as people.** Exponential's own pitch includes external
  agents, an MCP server, a CLI and an SDK. There is no "Developers & agents" section, no
  `llms.txt`, no CLI reference (it can be generated from `exponential-cli`'s command
  definitions), no MCP tool list, and `dev-docs/API_REFERENCE.md` is not surfaced. An agent
  pointed at the docs today learns less than one that reads `CONTEXT.md`.
- **Screenshots can be automated.** The Playwright e2e harness already seeds a disposable
  `dev-fixture` workspace and mints a session. A `docs:screenshots` script can capture each
  documented screen at a fixed viewport, in both themes, on every release, so images never rot.
- **No way back to the docs from inside the app.** The user menu has no Help/Docs entry; the
  only links are the marketing footer and the Resources menu. Each feature page in the app
  should have a `?` link to its doc, and the user menu should have "Help & docs".
- **No guardrails.** Nothing in CI checks docs links (my ad-hoc check found none broken, but
  that is luck), nothing detects when a sidebar label in the docs stops matching
  `NAV_ITEM_CONFIG`, and the PR template has no "docs updated?" prompt. That is how the sidebar
  description went stale silently.
- **Two sources of truth for the nav.** `navigation.ts` duplicates what frontmatter could
  express. Derive the sidebar from a single `_meta` per folder (title, order, icon) so adding a
  page cannot forget the sidebar (Epics did).
- **Security posture is good where it matters.** The WhatsApp warning block is honest and
  prominent. The External Agents page is a model of explaining a safety boundary. Keep both.
- **What is already good and should be preserved:** the Time Tracking page (voice, FAQ, real
  examples), External Agents, Epics (plain-English explanation of a concept), the iOS Shortcut
  walkthrough (numbered, screenshots, troubleshooting), Lists/Pipelines/Automations ("who /
  where / what happens" mental model), and the docs chrome itself (TOC, prev/next, breadcrumb,
  dark theme, public without login).

---

## Plan: best-in-class docs

Four phases. Each phase ships on its own and leaves the docs better than before. Estimates
assume agent-assisted writing with a human reviewing every page.

### Phase 0 — Stop the bleeding (2–3 days, one PR)

1. Fix the mobile layout: sidebar becomes a drawer below `lg`, TOC hidden below `xl`.
2. Add search. Cheapest good option: build a static index at build time (title, description,
   headings, first paragraph) and search it client-side with the existing command-palette
   component; Pagefind is the alternative if full-text is wanted.
3. Derive the sidebar from frontmatter (`section`, `order`, `icon`) via one `_meta` file per
   folder; delete the hand-maintained list. Support one level of nesting in the sidebar.
4. Add "Last updated" (from git) and "Edit this page on GitHub" to every page.
5. Add `scripts/check-docs.ts` to CI: every `/docs/...` link and `#anchor` resolves, every
   image exists, and every `**Label** in the sidebar` phrase matches a real nav label or a
   settings tab. Fail the build otherwise.
6. Write `dev-docs/DOCS_STYLE_GUIDE.md` plus a page template (see below) so every future page,
   human or agent written, has the same shape. Add "Docs updated? (link or n/a)" to the PR
   template.

### Phase 1 — New front door and information architecture (about a week)

Rewrite the three entry pages and re-home every existing page under a new sidebar. No new
feature pages yet; this phase is about making what exists findable and true.

**Introduction** (rewrite): one paragraph on what Exponential is (transcripts in, actions and
decisions out; Zoe; agents; products), who it is for (solo, team, product team), a diagram of
the object model, three "start here" paths, and a "what's in the box" grid with one card per
area linking into the sidebar sections.

**Concepts** (new): a one-screen glossary derived from `CONTEXT.md`: Workspace, Product,
Project, Action, Epic, Goal & Key Result, Meeting, Decision, Ceremony, Page, Ticket & Feature,
Plugin, Zoe, External agent. Each entry: two sentences and a link to the guide.

**Quickstart** (rewrite against the real UI, with screenshots): sign in, meet the sidebar as it
actually is, create a project and three actions, open Today, ask Zoe one question, connect one
capture channel (iOS shortcut or Chrome extension). Ten minutes, one screenshot per step.

**Proposed sidebar** (Diátaxis-shaped: start → concepts → guides by area → reference):

```
Get started        Introduction · Concepts · Quickstart · Install (web, mobile PWA, desktop)
Plan               Goals · OKRs & key results · Wheel of Life · Decisions
Do                 Inbox & Today · Actions · Projects · Epics · Time tracking · Daily plan
Build (Products)   Products · Tickets · Features & scopes · Cycles & sprints · Retrospectives ·
                   Metrics · Pages · Sprint insights
Reflect            Journal · Startup & wind-down routines · Habits · Weekly plan
Meet               Meetings · Fireflies · Ceremonies · Calendar & scheduling
Connect (CRM)      Contacts & organisations · Pipeline & deals · Lists · Automations ·
                   Forms & broadcasts
Collaborate        Workspaces · Teams · Members, roles & invites · Notifications · Activity
Zoe & AI           Assistant · Knowledge base · Chat gateways (WhatsApp, Telegram, Matrix) ·
                   Sprint insights
Capture anywhere   iOS shortcut · Chrome extension · Desktop app · Mobile app
Integrations       Overview · Slack · Notion · GitHub · Google · Monday.com
Developers & agents  API tokens · External agents · CLI · MCP server · SDK · Webhooks
Reference          Your settings · Workspace settings · Plugins · Keyboard shortcuts ·
                   Action sources & priorities
Self-hosting       (everything about env vars moves here, out of user pages)
```

Consolidations in this phase: one Fireflies page; Workflows and Integrations merge into the
Integrations overview; Settings splits into "Your settings" and "Workspace settings"; the
Best Practices blocks shrink to a short "Tips" section or move to a single "How we use
Exponential" article; Paddy becomes Zoe everywhere; "task" becomes "action" everywhere; all
sidebar-label claims are corrected and linked; the implementation leaks are removed.

**Page template** (the Time Tracking page, generalised):

```
title / one-line description
What it is (2–3 sentences) + one screenshot
Where to find it (linked route)
How to … (numbered, one task per H3)
How it connects (links to related concepts)
FAQ / Troubleshooting
```

### Phase 2 — Fill the gaps (2–3 weeks, one page per PR)

Write the missing pages from the coverage table, in this order (most-used and most-asked-about
first): Meetings · Products, Tickets and Cycles · Decisions · Pages · Ceremonies · CRM Pipeline,
Forms and Broadcasts · CLI reference (generated) · MCP server · Desktop app and Local wiki ·
Calendar and scheduling · Daily plan · GitHub, Google and Monday integrations · Telegram and
Matrix gateways · Members, roles, guests and restricted projects · Keyboard shortcuts and the
command palette. Each page follows the template and ships with its screenshot.

### Phase 3 — Best-in-class polish (ongoing)

1. `/go/<route>` resolver, then link every "Where to find it" to the live feature.
2. Contextual help: a `?` icon on each feature page in the app that opens its doc; "Help &
   docs" in the user menu.
3. Automated screenshots from the e2e fixture workspace on every release, light and dark.
4. `llms.txt` and `llms-full.txt` generated from the same Markdown, so agents get the docs too.
5. "What's new" page fed from the product timeline, and a changelog link from the Introduction.
6. Per-page "Was this helpful?" feedback (already have `SidebarFeedback`; reuse it).
7. Per-page OG images so shared links look right.
8. Quarterly audit: rerun the link and label checks, read the Quickstart against the current
   UI, and prune anything that describes a feature that no longer exists.

### Ownership and process

- One named docs owner; every feature PR that adds a route or a sidebar item either updates the
  matching page or links a ticket for it.
- Agents write first drafts from the template; a human reviews for truth against the UI before
  merge.
- Track the work in Exponential as one feature ("Docs v2") with one ticket per phase and one
  ticket per Phase 2 page, so progress is visible on the board.
