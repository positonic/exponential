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

## Relationships (activity)

- A **Workspace** has many **Workspace repositories**.
- A **Workspace** has many **Activity events** from zero or more **Activity sources**.
- The **Activity feed** is the read-side union of `WorkspaceActivityEvent` rows (internal) and GitHub commits + PRs fetched live from each `WorkspaceRepository` at query time.
- GitHub events shown in the activity feed are **not persisted** for the panel's purposes. They are fetched on page load via a shared `GITHUB_API_TOKEN` PAT (impactful-events style), with a ~5min server-side cache per repo to absorb refreshes.
- The existing webhook path (`/api/webhooks/github`) and `GitHubActivity` table remain — they continue to feed `SprintSnapshot` analytics, **independent** of the activity panel. The two paths can coexist for the same repo; the activity feed only uses live-fetch.

## Flagged ambiguities

- **"Meeting type" is not yet stored.** The Meetings v2 redesign surfaces `All / 1:1s / Rituals` tabs, but no `meetingType` column exists on `TranscriptionSession`. v1 ships with: All = full list, 1:1s = derived live from `participantCount = 2`, Rituals = empty state until a recurrence classifier exists. When Rituals gets real, the resolution will be either calendar recurrence data or a `meetingType` enum field with mutually exclusive values `one_on_one | ritual | other`.
- **"Decision" and "Open question" are not domain concepts (yet).** The Meetings v2 mockup shows chips and counts ("9 decisions logged", "4 open questions"). These are presentation-only at this stage — no schema, no extractor, no queries. Treat the chips as visual decoration until a deliberate decision to promote them.

- **One canonical detail surface: `/recording/[id]`.** Meetings v2 retires the inline `TranscriptionDetailsDrawer` in favour of a single navigation to the full detail page (ActionsPane, SummaryPane, TranscriptPane, etc.). When reading deleted drawer code in git history, this is why.
