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

**Meeting visibility**:
Who can see a Meeting. A user sees a Meeting if they created it, are a **Participant** on it, or can access its **Project**. Attendance trumps restriction: a Participant may *view* a Meeting they were in even when it sits in a **Restricted project** they can't otherwise access — restriction hides a project's contents from bystanders, not from the people in the room (view only; *edit* still requires project edit access). Meetings with no project fall back to workspace membership: any member of the workspace may view, and any non-viewer role may edit. Visibility **inherits from the project**; team ownership of a project does **not** narrow it (decision 2026-06-12: team-scoped-by-default was considered and rejected — use a **Restricted project** instead).
_Avoid_: Meeting permissions, sharing.

**Restricted project**:
A Project with `isRestricted: true` (default off, set via the "Restricted project" switch). Its content — Meetings included — is visible only to the project creator, explicit project members, and workspace **owners/admins** (the admin escape hatch). Restriction is an **explicit allowlist**: members of the owning *team* do **not** count (decision 2026-06-12 — joining a team must never silently grant access to its restricted projects; add teammates as project members instead). An *unrestricted* project and everything in it is visible to every workspace member regardless of role (viewer included) or team. This is the canonical mechanism for "admins may see it, plain members may not".
_Avoid_: Private project (use "restricted"), team project (team ownership ≠ restriction).

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

### Weekly planning

**Weekly plan**:
The personal, GTD-style weekly ritual where a user reviews their active **Projects**, has the system spot issues on each (stale, blocked, overdue, no next **Action**, no **Key result** linked, no end date, no description), tidies them, and records completion to keep a **streak**. The canonical user-facing and conversational word is "Weekly plan" — including when **Zoe** runs it in chat. The underlying schema is *review*-flavoured for historical reasons: the wizard at `/weekly-plan` runs `intro → reviewing → complete`, backed by `weeklyReview.ts`, `weeklyReviewCompletion` (one upserted row per `userId × workspaceId × week`), and `markComplete`. Strictly distinct from **Weekly outcomes** below.
_Avoid_: Weekly review (only in code/schema references — `weeklyReview*`), weekly planning (reserved for the team **Weekly outcomes** flow).

**Weekly outcomes**:
Forward-looking *team* planning — per-**Project**, per-week commitments with assignees, priority, and a due date — stored as `weeklyOutcomes` and managed by `weeklyPlanning.ts`. Distinct from the personal **Weekly plan**: outcomes are about *what the team will do this week*, the Weekly plan is about *reviewing the state of your projects*. The `/weekly-plan` command runs the Weekly plan, **not** this.
_Avoid_: Weekly plan (that's the personal review), outcome (overloaded — see the flagged `Outcome` table ambiguity).

**Weekly plan digest**:
The deterministic, server-computed list of the user's active Projects each annotated with its spotted issues and a health score — the single artefact both the `/weekly-plan` wizard UI and **Zoe** present. Today the scoring lives only in the React page (`calculateProjectHealthScore`); it is being extracted to one server procedure (`weeklyReview.getDigest`) so UI and agent show provably identical issues (same one-source-of-truth pattern as [ADR-0007](docs/adr/0007-deterministic-action-extraction.md)).
_Avoid_: Health score (that's one field of a digest entry, not the digest), needs-attention list.

**Weekly plan session**:
The single, server-persisted state of one in-progress **Weekly plan** — position, the set of reviewed Projects, the running change tally (`statusChanges`, `actionsAdded`, …), and `reviewMode` — keyed per `(userId, workspaceId, week)`, the same key as `weeklyReviewCompletion`. Shared by **both** surfaces: the `/weekly-plan` wizard and **Zoe**'s chat walk read and write the same session, so a user can review three projects in chat, open the wizard, and resume at the fourth (the ADR-0006 "two surfaces, one thread" pattern). A session is created at *start* and stamped `completedAt` at finish — so "completed this week" means `completedAt != null`, **not** mere row existence.
_Avoid_: Review session (only in code), wizard state (it is no longer client-only).

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

### Pipeline triage

The product-strategy pipeline that moves work from raw signal to committed delivery through **distinct gates**, so a team doesn't "ship clever solutions to problems nobody had". The chain (read left-to-right, each arrow is a gate that an item must pass or be **Parked**):

```
Problem ──<has many>── Hypothesis ──<has many>── Approach (= Project) ──► Roadmap | Backlog
  "is it real?"          "is it right?"            "is it worth building?"
```

The deliberate separation of the three gate-questions is the whole point — collapsing them is the failure mode the process exists to prevent. Source process: "Pipeline Triage & Prioritisation Process".

**Problem**:
A validated issue in the product worth solving — "who's hurt and how", backed by evidence (a count, a quote, an incident, a screenshot). Stored as `Problem`, scoped to a Product (`productId`). Carries a **lifecycle** (`Idea → Qualified → Prioritised`), an `impact` and a `confidence` score (the two prioritisation axes — **ease is deliberately not scored here**; ease lives on the Approach), and a free-text per-product `category` ("Data Scarcity", "Pipeline problems"). Strictly **distinct from Insight** — an Insight is raw evidence/observation from research; a Problem is the committed issue that enters the pipeline. A Problem may later be backed by Insights, but is filed directly today.
_Avoid_: Insight, issue, bug (a Problem is a strategy artefact, not an engineering ticket), pain point (that's an Insight type).

**Hypothesis**:
A **falsifiable claim** about how to resolve a Problem, plus how you'd know it's true or false. A lightweight child of a Problem (one Problem has many) — the size of a `UserStory`, rendered inline on the Problem, **not** a Project. Holds a `statement`, a `result` (the measurement plan), and an epistemic `status` (`Proposed → Testing → Confirmed → Refuted → Parked`). "An opinion until it has a measurement plan." Tested by an **Approach**.
_Avoid_: Bet, assumption, experiment (an Experiment/`Research` is what you *run* to test a Hypothesis, not the Hypothesis itself).

**Approach**:
A concrete way to **test or implement** a Hypothesis — *this is a `Project`*, not a separate model (a pursued approach is real, deliverable work with a repo, actions, a DRI). Two flavours: a **Test Approach** (confirm/refute the Hypothesis cheaply) or an **Implementation Approach** (roll out a confirmed Hypothesis). Scored on **effort/ease** (the axis Problems deliberately omit). Linked to its Hypothesis; a confirmed Implementation Approach **graduates** to the Roadmap or the Backlog.
_Avoid_: Solution, initiative (use "approach"); modelling it as its own table (it is a Project).

**Roadmap / Backlog**:
Where a confirmed Implementation **Approach (Project)** lands — **not a separate entity**. **Roadmap** = committed work *with timing* (a scheduled Project); **Backlog** = validated but not yet scheduled. There is no `Roadmap` table; a roadmap is a **view/state over Projects**. (The legacy static `/roadmap` marketing page is unrelated and not data-backed.)
_Avoid_: Treating "Roadmap" as a database or as the dependency-graph view (which deliberately avoids the word — it carries timeline connotations).

**Parked**:
A cross-cutting state for **Problems, Hypotheses, and Approaches** alike — an item that didn't pass its gate is parked **with a reason** (insufficient evidence, out of scope, duplicate, …), never deleted. The record of what was considered and why it was passed over; revisited quarterly. Modelled as `parkedAt` + `parkReason` on each entity, not a status value (an item's lifecycle status and its parked-ness are independent).
_Avoid_: Cancelled, rejected, dropped (parking is reversible and intentionally preserved).

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
The fifth tool, `ask_exponential` — the catch-all the four coarse tools don't cover (goals/OKRs, calendar, email, Slack, meetings, web, multi-step asks). Unlike a coarse tool it runs Zoe's full agent (Mastra) server-side with her whole tool set. The router still just passes `phrase`; the agent self-confirms destructive actions. It is also where **referential** requests go — a phrase whose object isn't self-contained ("capture *that* one", "complete *the first* one", "it") — because only the brain reads the **voice memory thread** and can resolve the referent against prior turns; coarse tools take the phrase verbatim and cannot. The **router persona** carries the rule that sends referentials here. See [ADR-0006](docs/adr/0006-web-voice-shares-text-thread.md).
_Avoid_: Fallback, default tool, catch-all (only in conversation).

**Voice tool catalog**:
The canonical set of tool descriptors the voice router is configured with (the four **coarse tools** + the **brain passthrough**), in the OpenAI Realtime flat-function shape. The **server is the single source of truth** — `voice.createSession` emits the catalog and the **router persona** in its response, and clients register exactly what they receive. iOS holds **no** hardcoded copy (it fails the session if the payload omits them); the web client and the server share one TS constant by import. See [ADR-0005](docs/adr/0005-server-issued-voice-catalog.md).
_Avoid_: Tool list, function catalog (use "voice tool catalog" or just "catalog").

**Router persona**:
The system instructions that define the voice router's character (Zoe — warm, British, witty) and its hard rules (always defer to a tool, never fabricate, the confirmation handshake, "you are the system — never tell the user to check their own list"). Part of the server-issued **voice tool catalog** payload; one canonical text drives every voice surface.
_Avoid_: System prompt, instructions (in conversation), persona alone (ambiguous with Zoe-the-agent's own persona).

**Voice memory thread**:
The Mastra memory thread the **brain** reads and writes for a voice session (`resource = userId`, `thread.id = threadKey`). The keying differs by surface: **web** binds it to the active text chat's **conversationId**, so typing and talking in the Zoe drawer are one continuous conversation (the brain recalls what was typed, and voice turns appear in the text history); **iOS** has no concurrent text chat, so it stays user-scoped (`voice-${userId}`). The **Voice router** stays zero-knowledge regardless — the thread is the brain's memory, never the router's. Supersedes the earlier ISOLATE assumption (voice kept wholly separate from text-chat memory), which now holds for iOS only. See [ADR-0006](docs/adr/0006-web-voice-shares-text-thread.md).
_Avoid_: Voice thread (ambiguous — say "voice memory thread"), conversation (overloaded).

### Chat

**ManyChat**:
The shared in-app agent chat component (`src/app/_components/ManyChat.tsx`) behind every embedded chat surface — the Zoe drawer and the agent chat pages — rendering streamed responses, tool activity, voice input, and the per-message feedback stars. Talks to `/api/chat/stream` under the signed-in user's web session. The name is purely internal and predates any awareness of **manychat.com** (the WhatsApp/Instagram automation SaaS) — in this codebase "ManyChat" always means this component, never that product. Rename candidate if the collision keeps confusing people (and agents).
_Avoid_: Reading it as manychat.com; chat widget, chatbox.

### Agent quality

_Operations (what to run, when, in what order): [dev-docs/AGENT_QUALITY_RUNBOOK.md](dev-docs/AGENT_QUALITY_RUNBOOK.md)._

**Thread**:
The unit of agent-quality measurement — one `conversationId`-scoped exchange between a user and **Zoe** (the brain), spanning one or more turns. A turn is a single `AiInteractionHistory` row (user message → Zoe response). On web a Thread is **mixed-modality**: typed and spoken turns share one `conversationId` (ADR-0006), so a Thread is judged as a whole regardless of how each turn was entered. Quality is assessed at the **Thread** level ("did Zoe resolve what the user came for?"), never per isolated turn — a turn like "do it" is only meaningful in Thread context. Turn-level facts (tool error, latency) are *inputs* to the Thread judgement, not separately scored entities. A Thread is in scope only when **Zoe-the-brain actually reasoned**: typed web, web-voice **brain passthrough**, Slack/API (`callAgent`), WhatsApp. **Coarse-tool** turns are out of scope — they are deterministic (parse → DB → speakable, no LLM), so their correctness is a unit-test concern, not a judge concern. iOS voice is deferred (see flagged ambiguity).
_Avoid_: Conversation (banned — overloaded), session (reserved against Meeting), chat.

**Thread score**:
An LLM-judge's assessment of one **Thread**, against **Zoe's contract** (not generic NLP axes). Four axes: **Resolved** (did the user get what they came for — the headline), **Grounded** (did Zoe call tools for facts/actions rather than fabricate — a hallucination is a grounding failure), **Tool success** (did the tools she invoked return vs. error — the "405" class), **No deflection** (did she avoid forbidden "go check your own list" behaviour, per the router persona). Latency is a **computed metric** (`responseTime`), never a judged axis. A Thread score measures **apparent** quality — the judge sees only the transcript, so it cannot know whether the **Action** Zoe created was the *right* one; only a human **Feedback** rating is ground truth. Human ratings exist to **calibrate** the judge, not be replaced by it. Stored in `ThreadScore` (keyed by `conversationId`), judged by Haiku 4.5 over **settled** Threads (no turn in the last hour). See [ADR-0012](docs/adr/0012-agent-quality-thread-scoring.md).
_Avoid_: Rating (reserved for the human `Feedback.rating`), confidence (reserved for `AiInteractionHistory.confidenceScore`, Zoe's own self-report — a third, distinct number), grade.

**Failure lane**:
The routing category a failed **Thread** is classified into, because the fix lives in a different place per lane. Three lanes: **`code_bug`** — a tool Zoe correctly chose errored or is missing (the "405" class); fix is a tRPC endpoint in *this* repo (`src/server/api/routers/…`). **`agent_behaviour`** — Zoe fabricated, deflected, or mis-resolved; fix is a prompt/tool change, split between the **router persona** + **voice tool catalog** (server-issued from this repo, `src/lib/voice/voiceToolCatalog`, ADR-0005) and **Zoe-the-brain's** agent instructions in **`../mastra`** (`src/mastra/agents/zoe-agent.ts`). **`capability_gap`** — the user wanted something no tool covers; not a bug at all, but a product **Ticket**/**Feature**. The improvement loop routes each bad Thread to its lane rather than pointing one agent at one repo — a single repo holds none of the lanes completely.
_Avoid_: Bug (only `code_bug` is a bug — the other two lanes are not), error category.

**EvalCase**:
A frozen, replayable test distilled from a failed **Thread**: the conversation prefix up to the violating turn (`violatingTurnIndex`), plus the contract expectation that was violated ("must not deflect; should have called `createAction`"). EvalCases accumulate as a growing regression suite — passing cases keep guarding — and are retired manually (`active` flag) when the product changes underneath them (e.g. a `capability_gap` ships and the old expectation inverts). Stored in exponential's Postgres (`EvalCase`, cascade-linked to its `ThreadScore`). See [ADR-0013](docs/adr/0013-eval-replay-frozen-prefix.md).
_Avoid_: Test case (too generic), fixture, golden.

**Eval replay**:
Scoring a **candidate prompt** against the **EvalCase** suite, offline, before any deploy: one model call per case — the frozen prefix is fed to the candidate brain and only the next response is judged against the stored expectation. Tools never execute; tool calls are captured and judged as **intent**. The engine is Mastra's native `runEvals` running the assistant agent **in-process from the `../mastra` working tree** (the candidate is a git branch — evals test the artifact that deploys), orchestrated by exponential's `eval-prompt` harness, judged by the contract judge. No Mastra server required. A patch that beats baseline yields a PR with eval evidence; a human always merges. See [ADR-0013](docs/adr/0013-eval-replay-frozen-prefix.md).
_Avoid_: Rerun, simulation, backtest.

**Prompt version**:
The deterministic fingerprint stamped on every `AiInteractionHistory` row at write time, composing what each repo owns: `router@<hash>` (this repo's router persona + voice tool catalog, ADR-0005) `+brain@<hash>` (Zoe-the-brain's instructions, reported by `../mastra` in response metadata). Score-by-version trends are the proof a prompt change helped, and the canary/rollback comparison across a deploy boundary. Falls back to `router@<hash>` alone when the brain doesn't report (older Mastra deploys). See [ADR-0012](docs/adr/0012-agent-quality-thread-scoring.md) decision 7 and [ADR-0013](docs/adr/0013-eval-replay-frozen-prefix.md).
_Avoid_: Prompt hash (it is a composite of two), version (ambiguous with app releases).

**Round-trip**:
One full LLM↔Anthropic pass over Zoe's **entire** prompt (SOUL ~6K + tool schemas + observational memory recall + conversation ≈ 86K tokens on a daily-planning turn). Count ≈ **tool-calls + 1**, because every tool call forces another pass. The atomic unit of *both* latency and token spend — each pass re-bills the whole prompt (counts against `tokenUsage`) **and** adds wall-time (counts against `responseTime`). Tier-sensitive: ~3–7s/pass on Haiku 4.5, ~25–30s/pass on Sonnet 4.5 at this prompt size. The Mastra framework calls the same thing a **step**; `zoeAgent`'s `maxSteps: 12` (`../mastra/src/mastra/agents/zoe-agent.ts`) is the round-trip ceiling.

  ⚠️ **Correction (2026-06-13, from AI-tracing spans):** the LLM pass time above was **not** the dominant latency. On a 2-minute insert-an-action turn, the spans showed the actual Sonnet passes ran ~8s and ~4s; **172 of 188s (91%) was the observational-memory input step processor running synchronously before *each* step (~86s/step).** So per-step latency = LLM pass + a fixed observational-memory tax that dwarfs it. Round-trip count still matters — but largely because **each extra step dragged another ~86s of synchronous consolidation**, not because of pass cost. The fix takes consolidation off the synchronous turn path — fully (async) under thread scope, or bounded/infrequent under resource scope, which has no async path by design (see [ADR-0015](docs/adr/0015-observational-memory-off-turn-path.md)). After that, this entry's pass-time model is the real per-step cost again.
_Avoid_: Hop, iteration, call (too generic — a tool call is one input to a round-trip, not the round-trip itself).

**Thread cost**:
A **Thread** that **Resolved** but burned excessive **round-trips** (and therefore latency and tokens) getting there — e.g. the daily-planning turn that answered correctly but spent 9 tool calls / 5 round-trips / ~86K-token passes. **Orthogonal to the Failure lanes**: those classify Threads that did *not* Resolve, whereas a Thread-cost problem can score perfectly on all four **Thread score** axes and still be wrong to ship. Not measured by the quality judge (latency is a computed metric, never a judged axis) — it is read off `responseTime` / `tokenUsage` directly. The lever is **round-trip count × prompt size**: fewer tool calls (one bulk fetch over per-entity fan-out; robust tool schemas so the model doesn't retry on a rejected argument) and **lean tool-result payloads** — return only the fields the model reasons over, because a fat result re-bills on every *later* round-trip (e.g. `getAllGoals` ships 39 goals each with nested `projects[]`/`outcomes[]`; that graph is re-sent every subsequent pass). Three found drivers: the `getAllProjectsTool` `includeAll` string-vs-boolean retry, the per-project `getProjectActionsTool` fan-out, and fat tool-result payloads. **Not** a driver: Anthropic `deferLoading` (tool schemas held out of the prompt via BM25 tool-search, `../mastra/src/mastra/utils/anthropic-prompt-cache.ts`) was verified working at `@ai-sdk/anthropic` 3.0.71 — the ~86K prompt is content (tool results + memory), not the 50 tool schemas.
_Avoid_: Slow Thread (vague), latency (one symptom/metric, not the concern), expensive Thread (use "Thread cost").

### Identity & device auth

**Connected account**:
An external OAuth account (Google/Microsoft) a `User` has linked for **data access** — calendar today, Contacts/Gmail later. Stored in `ConnectedAccount`, owned by the linking User, and strictly **distinct from `Account`** (the NextAuth sign-in identity, whose global `@@unique([provider, providerAccountId])` is load-bearing for auth). Keyed by `(userId, provider, providerAccountId)`, so the *same* external account can be connected by many Users independently and one User can connect many — and linking it **never touches that account's own login** (e.g. signed in as `jamespfarrell@gmail.com`, you can add `email@jamesfarrell.me`'s calendar without affecting `jamesfarrell.me`'s user). Calendar tokens live here, not on `Account`, so signing in with Google can't clobber them. The OAuth callback writes `ConnectedAccount` for `type=calendar` and the legacy `Account` for `type=contacts|crm` (CRM hasn't migrated yet). Disconnect hard-deletes the row. See [ADR-0009](docs/adr/0009-connected-accounts-decoupled-from-auth.md).
_Avoid_: "Account" (reserved for the sign-in identity), integration, calendar connection (it's the account, not the calendar — one connected account exposes many calendars).

**Device-token**:
The durable per-device credential a native iOS/Mac app holds after sign-in — a ~30-day JWT (`aud: "device"`, `tokenType: "device-token"`), signed with `AUTH_SECRET` by `generateJWT`. Sent as `Authorization: Bearer` and accepted everywhere the tRPC context validates JWTs (`api/trpc.ts`), so it resolves to a userId exactly like the web session cookie or a legacy `x-api-key`. Minted by `auth.exchangeAuthCode`. Distinct from the **voice-session JWT** (~30 min, `aud: "voice-session"`, body-only) and the legacy durable **API key** (`x-api-key`, a `VerificationToken` row).
_Avoid_: API key, session token (both are different credentials), bearer (the mechanism, not the credential).

**Native auth code**:
The short-lived, 60-second code the app swaps for a **device-token**. A stateless signed JWT (no DB row) bound to the user + the PKCE `code_challenge`, **signed with a key derived from `AUTH_SECRET`, not `AUTH_SECRET` itself** — so an intercepted code can never be replayed as a Bearer device-token. Because it is stateless its `jti` is not tracked, so it is *single-use in practice via PKCE* (a replay is useless without the device-held `code_verifier`) rather than enforced single-use — true single-use waits on the Phase 2 Device store. Issued by `GET /api/auth/native/start` after NextAuth login, redeemed by `auth.exchangeAuthCode`. There is no `/complete` route — `/start` is its own post-login callback. See ADR 0005 in the `exponential-ios` repo (the contract is owned there; this backend only implements it).
_Avoid_: Token (it is not a credential — it's a redemption coupon), OAuth code (it's a thin PKCE layer over an existing NextAuth session, not a full OAuth server).

**Any-of credential gate**:
The rule that voice endpoints (e.g. `voice.createSession`) accept **any** of three credentials, all resolving to one userId. Implemented in `resolveVoiceCaller` (`src/server/api/middleware/resolveVoiceCaller.ts`) — **not** `apiKeyMiddleware`, which is the separate gate used by non-voice routers (`timeEntry`, `project`, …). Tried in priority order: **(1)** `ctx.session` — a NextAuth cookie (web) **or** an `Authorization: Bearer <JWT>` that `createTRPCContext` already verified (raw `AUTH_SECRET`, **no audience constraint**) and normalized into a session. This is the path a native **device-token** resolves through, so a device-token authenticates voice with no voice-specific code (matching ADR 0005). **(2)** `x-api-key` → `VerificationToken` lookup (legacy/dev). Session/Bearer wins when more than one is present. NB: the explicit `resolveDeviceToken` slot inside the resolver is **inert/redundant** — device-tokens already resolve via (1); its unit test exercises the resolver in isolation (fake bearer, no `ctx.session`), so it asserts only that the *slot* returns nothing, not that device-tokens fail end-to-end.
_Avoid_: Auth middleware (too generic), API-key auth (it's no longer only API keys).

## Flagged ambiguities

- **"Meeting type" is not yet stored.** The Meetings v2 redesign surfaces `All / 1:1s / Rituals` tabs, but no `meetingType` column exists on `TranscriptionSession`. v1 ships with: All = full list, 1:1s = derived live from `participantCount = 2`, Rituals = empty state until a recurrence classifier exists. When Rituals gets real, the resolution will be either calendar recurrence data or a `meetingType` enum field with mutually exclusive values `one_on_one | ritual | other`.
- **"Decision" and "Open question" are not domain concepts (yet).** The Meetings v2 mockup shows chips and counts ("9 decisions logged", "4 open questions"). These are presentation-only at this stage — no schema, no extractor, no queries. Treat the chips as visual decoration until a deliberate decision to promote them.

- **"Outcome" is an undocumented table with unresolved semantics.** `model Outcome` (`prisma/schema.prisma:694`) has `description`, `dueDate`, `type @default("daily")`, `whyThisOutcome`, and bridges Goals↔Projects (`goals[]`, `projects[]`) — yet it has no glossary entry and sits *beside* the Objective(Goal)/Key result vocabulary rather than inside it. Owner's current read: an Outcome is "most akin to a **milestone**," and the recursion he wants for goals-of-goals is **already** served by `Goal.parentGoalId` (not by Outcome). Treated as logic/thinking debt: deliberately **excluded from the Exponential iOS voice v1 scope** (which operates on Action + Project only) until the milestone-vs-objective distinction is settled. Do not write a canonical definition until then.

- **One canonical detail surface: `/recording/[id]`.** Meetings v2 retires the inline `TranscriptionDetailsDrawer` in favour of a single navigation to the full detail page (ActionsPane, SummaryPane, TranscriptPane, etc.). When reading deleted drawer code in git history, this is why.

- **iOS voice has no per-exchange Thread boundary.** Web binds the voice session to the active text chat's `conversationId`, so each exchange is a distinct **Thread**. iOS has no concurrent text chat, so it stays on a perpetual `voice-${userId}` thread (ADR-0006) — one blob per user, not a per-exchange Thread. Agent-quality scoring therefore **defers iOS** until iOS voice issues a real per-exchange `conversationId`. Until then, iOS Zoe quality is unmeasured by the Thread judge.

- **Voice/text memory split — resolved per surface.** The web Zoe drawer shows typed and spoken turns in one visual thread (🎙 marker), but they historically wrote to two different **voice memory threads** — text to `conversationId`, voice to `voice-${userId}` — so switching modes looked like Zoe losing the thread ("I can't see anything discussed before"). Resolved: web unifies both onto the `conversationId` thread; iOS stays user-scoped because it has no concurrent text chat. The 🎙 marker is now purely presentational. See [ADR-0006](docs/adr/0006-web-voice-shares-text-thread.md).
