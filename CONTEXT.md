# Exponential

Productivity OS that turns meeting transcripts into projects, actions, and decisions. The domain language below is what we mean precisely — match it in code, UI copy, and conversation.

## Language

### Meetings

**Meeting**:
A recorded conversation captured as a transcript, summary, and participant list. Stored in `TranscriptionSession` in the schema; the user-facing word is always "meeting", never "transcription" or "session".
_Avoid_: Transcription, session, call.

**Ritual**:
A recurring team meeting on a stable cadence with a stable participant set — standup, retro, weekly sync, planning, all-hands. Detected by calendar recurrence rule (future work) or a user mark on a meeting series.
_Avoid_: Internal, sync, standup (as a category — standup is one *kind* of ritual).

**1:1**:
A meeting with exactly two participants — typically manager/report or peer check-ins. Derivable from participant count.
_Avoid_: One-on-one, 121.

**Meeting type**:
The bucket a meeting falls into for navigation. Current values surfaced in UI: `all`, `one_on_one`, `ritual`. Mutually exclusive when assigned. Not yet stored — see "Flagged ambiguities" below.

**Action**:
A task extracted from a meeting by Zoe and persisted in the `Action` table. The canonical word everywhere — schema, tRPC routers, CLI, UI. Never "task" in user-facing copy, despite Beads/Task-Master using "task" for their own concepts.
_Avoid_: Task, todo, item.

**Participant**:
A person on the meeting invite, stored in `TranscriptionSessionParticipant` with email, optional name, optional linked `User` or `CrmContact`. Authoritative source for "who was in this meeting". Silent attendees count.
_Avoid_: Attendee (only as a count word — "4 attendees"), invitee.

**Speaker**:
A person who actually talked, derived from `transcription.sentences[].speaker_name`. Strictly distinct from **Participant** — a Speaker may be unmatched to any Participant ("Unknown"), and a Participant may never have spoken. Use Speaker for transcript navigation; use Participant for "who's on this call" UI.
_Avoid_: Talker, contributor.

## Relationships

- A **Meeting** has zero or more **Participants** (`TranscriptionSessionParticipant`).
- A **Meeting** has zero or more **Speakers** (derived from transcript). The Participant and Speaker sets overlap but are not identical.
- A **Meeting** belongs to at most one **Project** and at most one **Workspace**.
- A **Meeting** produces zero or more **Actions** (extracted by Zoe).
- A **Ritual** is a *kind of* **Meeting** — not a separate entity.

### Activity

**Activity event**:
A single thing that happened in a workspace, recorded after the fact for display on the home activity panel, heatmap, and weekly review. Always tied to a workspace and a point in time. Has a **source** that says where it came from.
_Avoid_: Event (too generic — only "activity event" or "activity" in conversation).

**Activity source**:
The origin of an activity event. Two sources exist today: `internal` (things that happened inside Exponential — action created, ticket commented, status changed) and `github` (commits and pull requests from connected repos). The activity panel switcher lets a workspace member filter by source via a three-state segmented control: `All` / `Exponential` / `GitHub`. The switcher is hidden when a workspace has no `WorkspaceRepository` rows. State persists in the URL as `?source=`. Future sources are anticipated (Linear, Notion, Slack) but not in scope.
_Avoid_: Type, kind, channel.

**GitHub identity claim**:
An Exponential user's claim to a GitHub login, stored as `User.githubLogin: String?`. The column can only be set via an OAuth-verified flow on `/settings/profile` — never by free-text input — so that one user cannot claim another user's commits. The activity feed joins GitHub events to `User` via `User.githubLogin = githubEvent.author`; unmatched events render with the raw GitHub login and a generic icon. Separate from `IntegrationUserMapping`, which scopes external identities to specific integration installations and is meant for Slack-style "users discovered through this integration."
_Avoid_: GitHub user mapping, GitHub link (use "GitHub identity claim" or just "claim" in conversation).

**Workspace repository**:
A GitHub repo a workspace has declared interest in, stored in `WorkspaceRepository { workspaceId, owner, name, friendlyName?, isPrimary?, syncStatus, lastSyncedAt }`. Added by pasting a `https://github.com/owner/repo` URL in the workspace settings → Integrations → GitHub Repositories card. The declaration is independent of whether anyone has installed the GitHub App on the repo — the source of truth for "which repos belong to this workspace's activity panel" is `WorkspaceRepository`, not `Integration`. A repo can be present in multiple workspaces (one row per workspace × repo pair).
_Avoid_: Connected repo, tracked repo, linked repo (use "workspace repository" or just "repo" in conversation).

**Activity feed**:
The chronological list shown in the activity panel on `/w/[slug]/home`. A union over the workspace's activity events from all enabled sources, paginated by cursor on `createdAt`. The feed is a **read-side projection** — it merges the two underlying tables (`WorkspaceActivityEvent` and `GitHubActivity`) in app code; the tables are kept separate at rest because they have genuinely different shapes and serve other consumers (Sprint Analytics queries `GitHubActivity` columns directly).
_Avoid_: Activity log, event log, stream.

**OKR activity**:
Distinct from the workspace **Activity feed** above — this is the per-item timeline inside the OKR detail drawer's "Activity" tab. For a Key result it merges that KR's comments (`KeyResultComment`) and check-ins (`KeyResultCheckIn`). For an Objective it is a **roll-up**: the objective's own comments/updates (`GoalComment`, `GoalUpdate`) merged with the comments and check-ins of *all its child Key results*, time-sorted into one feed, each rolled-up item tagged with a source chip naming its KR. Built read-side by a single `okr.getObjectiveActivity` procedure (same merge-in-app-code pattern as [ADR-0001](docs/adr/0001-activity-feed-storage.md)), never stored. The objective composer always writes an objective-level `GoalComment`; rolled-up KR items are read-only context.
_Avoid_: Comments (the tab is a mixed feed of comments **and** check-ins, not comments alone), Discussion.

## Relationships (activity)

- A **Workspace** has many **Workspace repositories**.
- A **Workspace** has many **Activity events** from zero or more **Activity sources**.
- The **Activity feed** is the read-side union of `WorkspaceActivityEvent` rows (internal) and GitHub commits + PRs fetched live from each `WorkspaceRepository` at query time.
- GitHub events shown in the activity feed are **not persisted** for the panel's purposes. They are fetched on page load via a shared `GITHUB_API_TOKEN` PAT (impactful-events style), with a ~5min server-side cache per repo to absorb refreshes.
- The existing webhook path (`/api/webhooks/github`) and `GitHubActivity` table remain — they continue to feed `SprintSnapshot` analytics, **independent** of the activity panel. The two paths can coexist for the same repo; the activity feed only uses live-fetch.

### Product

**Product**:
A unit of work delivery owned by a workspace — has its own backlog, features, cycles, retros. Stored as `Product`. Routes live under `/w/[slug]/products/[productSlug]`. A Product also **owns zero or more Projects** (`Project.productId`, nullable) — so a Product spans two parallel work hierarchies: Feature→Ticket (product-management work) and Project→Action (delivery work). The product list and a Products & Projects view live as sibling routes (`/products`, `/products-grid`, `/products-projects`).
_Avoid_: App, service, module.

**Unassigned project**:
A Project with `productId = null` — it belongs to a workspace but not to any Product. The default state for every project (the link is opt-in), and where a project lands when its Product is deleted (`onDelete: SetNull`). Surfaced as an "Unassigned" group in the Products & Projects view.
_Avoid_: Orphan project (only in conversation/code, never UI copy).

**Ticket**:
A unit of engineering work inside a Product, stored as `Ticket`. Has its own status enum (`BACKLOG`, `NEEDS_REFINEMENT`, … `DEPLOYED`, `ARCHIVED`), type (`BUG`, `FEATURE`, `CHORE`, …), optional `assignee`, optional `cycle`. Strictly **distinct from Action** — Tickets are product-management artefacts; Actions are meeting-extracted tasks. A Ticket may have many child Actions (`Ticket.actions`), but they are not the same entity. User-facing word is always "ticket" inside the product surface.
_Avoid_: Task, story, item, issue.

**Feature**:
A coherent slice of product capability inside a Product, stored as `Feature`. Has `status` (`IDEA`, `DEFINED`, `IN_PROGRESS`, `SHIPPED`, `ARCHIVED`), optional `vision`, optional alignment to a Goal (`Feature.goalId`). Groups Tickets (`Ticket.featureId`).

**Objective**:
A strategic outcome — what Exponential schemas call `Goal`. Use the word "Objective" in OKR conversation and UI affordances ("Aligned to objective: …"); the underlying table is `Goal` for historical reasons. An Objective can nest under a parent Objective (`Goal.parentGoalId`), be scoped to a `period` (e.g. `Q2-2026`), and have many **Key results**.
_Avoid_: OKR (overloaded — see below), goal (only in code/schema references).

**Key result**:
The measurable arm of an Objective, stored as `KeyResult`. Has `currentValue`, `targetValue`, `status` (`on-track | at-risk | off-track | achieved`), and a `confidence` score. Lives under exactly one Objective via `keyResult.goalId`.

**OKR**:
Shorthand for the *pair* (Objective + its Key results). Never use "OKR" to mean a single Objective or a single Key result on its own — be specific.
_Avoid_: Using "OKR" as a singular noun for one of the parts.

**Effective status**:
What an Objective's or Key result's status badge actually shows. Each entity stores **two separate values**: an **auto** value — `Goal.health` (the "computed health cache aggregated from KRs", rewritten by `recomputeHealth`) / `KeyResult.status` (rewritten by check-ins) — and a nullable **manual override** — `Goal.healthOverride` / `KeyResult.statusOverride`. The effective status displayed everywhere is `override ?? auto`. Setting status via the drawer writes the *override* column only; choosing "Auto" sets the override back to `null` and the derived value reappears. The auto column is never overwritten by the manual path. See [ADR-0004](docs/adr/0004-okr-manual-status-override.md).
_Avoid_: Conflating "health" (Objective) with "status" (Key result) — same idea, different column per entity; "status" as a single stored value (it is two columns reconciled at read).

**Favourite**:
A per-user pin of any entity, surfaced in a "Favourites" section in the left nav under "Workspaces". Stored polymorphically in `Favorite { userId, workspaceId, entityType, entityId, createdAt }` — one row per user × entity. v1 wires `entityType` `objective` and `keyResult` only (table is deliberately extensible to projects/meetings later). The Favourites section is **workspace-scoped** — it shows only favourites whose `workspaceId` matches the current workspace. Clicking a favourite opens that item's OKR drawer via its deep link. Toggled by the star CTA in the OKR detail drawer.
_Avoid_: Star, bookmark, pin (use "favourite"; "star" only for the CTA icon itself).

### Product alignment chain

The strategic-alignment chain (read top-down, container relationship):

```
Objective (Goal)
   ├─ has many ─► Key result
   └─ aligned-to ◄── Feature  (Feature.goalId → Goal.id, optional)
                       └─ has many ─► Ticket  (Ticket.featureId, optional)
```

- A Feature aligns to **at most one** Objective. Key results are *siblings* of that alignment, not on the path — a Ticket does not link to a Key result directly.
- A Ticket may have no Feature (orphan); a Feature may have no Objective.
- Hierarchy edges in this chain are **containment/alignment**, never blocking. Roll-up of status (e.g. "this Objective has 3 blocked tickets") is computed by traversal, not stored.

### Ticket dependencies

**Ticket dependency**:
A directed peer relationship between two Tickets in the same Product, stored as `TicketDependency { ticketId, dependsOnId }`. Reads as "`ticketId` is blocked by `dependsOnId`". Enforced same-product and cycle-checked on insert (`wouldCreateCycle`). Surfaced in the UI as two sections: **Depends on** (outgoing) and **Required for** (incoming).
_Avoid_: Block, blocker (as a noun for the relationship — only "ticket dependency" or "depends on").

**Blocked**:
A Ticket is "blocked" when its `openBlockerCount > 0` — i.e. it has at least one `Depends on` Ticket whose status is not in `COMPLETED_TICKET_STATUSES` (`DONE`, `DEPLOYED`, `ARCHIVED`). A "Blocked" *status* (`TicketStatus.BLOCKED`) also exists on the enum, but is **independent** of the computed `isBlocked` — a Ticket can be in status `IN_PROGRESS` and still be `isBlocked: true` (rare but legal). Treat the computed flag as authoritative for triage UI.

### Dependency graph

**Dependency graph**:
A per-Product visualisation surfaced on the product detail page that overlays two distinct edge types: ticket-dependency edges (blocking, peer, DAG) and alignment edges (`Ticket → Feature → Objective`, hierarchical). Purpose: trace "this Objective is at risk" down to the specific Tickets jamming progress. Edge types are visually distinguished — not collapsed into one. Key results appear as decoration on Objective nodes (status chip), not as graph nodes.
_Avoid_: Roadmap (carries timeline connotations), tree (loses the cross-cutting blocking edges), org chart.

### Voice

**Voice router**:
The OpenAI Realtime model that fronts a voice session (on the iOS app and the web voice client). It is a **router and a voice, with ZERO knowledge of the user's data** — it picks an intent, speaks, and must call a tool for any fact or action, never answering from memory. Strictly distinct from the **brain**: the router decides *which* tool; the server-side brain (`voice.dispatch`) does the work. Governed by the **router persona**.
_Avoid_: Assistant, agent (the router is not the agent — Zoe-the-agent is the brain passthrough below), bot.

**Coarse tool**:
One of the four fast, deterministic intents the voice router can call — `capture_action`, `get_todays_plan`, `query`, `complete_action`. Each takes the user's words verbatim as `phrase` and is handled server-side without an LLM (parse → DB → speakable). Distinct from the **brain passthrough**. `complete_action` is the only destructive one and requires the spoken **confirmation handshake**.
_Avoid_: Function, skill, command.

**Brain passthrough**:
The fifth tool, `ask_exponential` — the catch-all the four coarse tools don't cover (goals/OKRs, calendar, email, Slack, meetings, web, multi-step asks). Unlike a coarse tool it runs Zoe's full agent (Mastra) server-side with her whole tool set. The router still just passes `phrase`; the agent self-confirms destructive actions.
_Avoid_: Fallback, default tool, catch-all (only in conversation).

**Voice tool catalog**:
The canonical set of tool descriptors the voice router is configured with (the four **coarse tools** + the **brain passthrough**), in the OpenAI Realtime flat-function shape. The **server is the single source of truth** — `voice.createSession` emits the catalog and the **router persona** in its response, and clients register exactly what they receive. iOS holds **no** hardcoded copy (it fails the session if the payload omits them); the web client and the server share one TS constant by import. See [ADR-0005](docs/adr/0005-server-issued-voice-catalog.md).
_Avoid_: Tool list, function catalog (use "voice tool catalog" or just "catalog").

**Router persona**:
The system instructions that define the voice router's character (Zoe — warm, British, witty) and its hard rules (always defer to a tool, never fabricate, the confirmation handshake, "you are the system — never tell the user to check their own list"). Part of the server-issued **voice tool catalog** payload; one canonical text drives every voice surface.
_Avoid_: System prompt, instructions (in conversation), persona alone (ambiguous with Zoe-the-agent's own persona).

## Flagged ambiguities

- **"Meeting type" is not yet stored.** The Meetings v2 redesign surfaces `All / 1:1s / Rituals` tabs, but no `meetingType` column exists on `TranscriptionSession`. v1 ships with: All = full list, 1:1s = derived live from `participantCount = 2`, Rituals = empty state until a recurrence classifier exists. When Rituals gets real, the resolution will be either calendar recurrence data or a `meetingType` enum field with mutually exclusive values `one_on_one | ritual | other`.
- **"Decision" and "Open question" are not domain concepts (yet).** The Meetings v2 mockup shows chips and counts ("9 decisions logged", "4 open questions"). These are presentation-only at this stage — no schema, no extractor, no queries. Treat the chips as visual decoration until a deliberate decision to promote them.

- **"Outcome" is an undocumented table with unresolved semantics.** `model Outcome` (`prisma/schema.prisma:694`) has `description`, `dueDate`, `type @default("daily")`, `whyThisOutcome`, and bridges Goals↔Projects (`goals[]`, `projects[]`) — yet it has no glossary entry and sits *beside* the Objective(Goal)/Key result vocabulary rather than inside it. Owner's current read: an Outcome is "most akin to a **milestone**," and the recursion he wants for goals-of-goals is **already** served by `Goal.parentGoalId` (not by Outcome). Treated as logic/thinking debt: deliberately **excluded from the Exponential iOS voice v1 scope** (which operates on Action + Project only) until the milestone-vs-objective distinction is settled. Do not write a canonical definition until then.

- **One canonical detail surface: `/recording/[id]`.** Meetings v2 retires the inline `TranscriptionDetailsDrawer` in favour of a single navigation to the full detail page (ActionsPane, SummaryPane, TranscriptPane, etc.). When reading deleted drawer code in git history, this is why.
