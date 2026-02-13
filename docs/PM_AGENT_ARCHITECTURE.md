# PM Agent Architecture — Developer Guide

The PM Agent system is a two-service architecture providing AI-driven sprint analytics, GitHub activity tracking, and automated standup/wrapup delivery across Exponential (data + API) and Mastra (agent execution + delivery).

## Architecture Overview

```
Exponential (Vercel)                         Mastra (Railway)
+--------------------------+                +---------------------------+
| DATA + API LAYER         |   tRPC/HTTP    | AGENT + DELIVERY LAYER    |
|                          | <------------> |                           |
| - Prisma models (5 new)  |                | - Paddy agent + 5 tools   |
| - SprintAnalyticsService |                | - authenticatedTrpcCall   |
| - GitHubActivityService  |                | - WhatsApp gateway        |
| - sprintAnalytics router |                | - PMScheduler (planned)   |
| - GitHub webhook handler |                |                           |
+--------------------------+                +---------------------------+
```

Exponential is stateless (Vercel). Mastra is persistent (Railway) and owns scheduling, agent execution, and WhatsApp delivery. Data stays in Exponential because every new model has foreign key relationships to existing entities (Action, List, User, Workspace, Integration).

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| `SprintAnalyticsService` | `src/server/services/SprintAnalyticsService.ts` | Velocity, burndown, risk signals, daily snapshots, active sprint lookup, velocity history |
| `GitHubActivityService` | `src/server/services/GitHubActivityService.ts` | Processes push/PR/review webhook events, 3-tier action mapping, activity summaries |
| `sprintAnalytics` router | `src/server/api/routers/sprintAnalytics.ts` | tRPC endpoints wrapping both services, uses `apiKeyMiddleware` for auth |
| GitHub webhook handler | `src/app/api/webhooks/github/route.ts` | Receives GitHub webhook events, delegates to `GitHubActivityService` |
| `apiKeyMiddleware` | `src/server/api/middleware/apiKeyAuth.ts` | Auth middleware accepting session JWT or `x-api-key` header |

### Execution Flow

```
1. GitHub sends webhook event (push, PR, review)
2. Webhook handler validates signature, delegates to GitHubActivityService
3. GitHubActivityService stores event as GitHubActivity record (deduped)
4. 3-tier mapping attempts to link event to an Action
5. Daily: captureDailySnapshot aggregates kanban + GitHub counts into SprintSnapshot
6. On demand: Mastra PM tools call tRPC endpoints via authenticatedTrpcCall
7. Agent assembles metrics, risk signals, burndown data into standup/wrapup messages
8. Agent delivers via WhatsApp gateway (or other configured channel)
```

**Auth flow**: Mastra calls Exponential tRPC endpoints using either a user session JWT (passed through `requestContext`) or an API key (via `x-api-key` header) for scheduled/automated calls with no user context.

---

## Data Models

All five models are defined in `schema.prisma`, migration: `20260213130545_add_pm_agent_models`.

### GitHubActivity

Stores individual GitHub events (push commits, PR actions, reviews).

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | String | `"push"`, `"pull_request"`, or `"pull_request_review"` |
| `externalId` | String | GitHub-provided ID (SHA, node_id) |
| `actionId` | String? | FK to Action — set when mapped to an action |
| `mappingMethod` | String? | `"explicit"` or `"branch"` |
| `mappingConfidence` | Float? | 0.0 to 1.0 |
| `workspaceId` | String | FK to Workspace |
| `integrationId` | String? | FK to Integration |

**Unique constraint**: `externalId` + `eventType` (deduplication).

### SprintSnapshot

Daily snapshots of sprint state for burndown tracking.

| Field | Type | Description |
|-------|------|-------------|
| `listId` | String | FK to List (the sprint) |
| `snapshotDate` | DateTime | Date of snapshot |
| `backlogCount` | Int | Actions in BACKLOG status |
| `todoCount` | Int | Actions in TODO status |
| `inProgressCount` | Int | Actions in IN_PROGRESS status |
| `inReviewCount` | Int | Actions in IN_REVIEW status |
| `doneCount` | Int | Actions in DONE status |
| `cancelledCount` | Int | Actions in CANCELLED status |
| `commitsCount` | Int | GitHub commits that day |
| `prsOpened` | Int | PRs opened that day |
| `prsMerged` | Int | PRs merged that day |
| `prsReviewed` | Int | PR reviews that day |

**Unique constraint**: `listId` + `snapshotDate` (one snapshot per day per sprint).

### SprintMetrics

Cached aggregate metrics for completed sprints.

| Field | Type | Description |
|-------|------|-------------|
| `listId` | String | FK to List (unique 1:1) |
| `velocity` | Float | Story points or action count completed |
| `completionRate` | Float | Fraction of planned actions completed |
| `plannedActions` | Int | Actions at sprint start |
| `completedActions` | Int | Actions completed by sprint end |
| `addedActions` | Int | Scope creep — actions added after start |

### ActionStatusChange

Audit trail of kanban status transitions.

| Field | Type | Description |
|-------|------|-------------|
| `actionId` | String | FK to Action |
| `previousStatus` | ActionStatus | Status before change |
| `newStatus` | ActionStatus | Status after change |
| `changedAt` | DateTime | When the transition occurred |
| `changedByUserId` | String? | FK to User who made the change |

### PMAgentConfig

User preferences for the PM agent (standup/wrapup schedule and channel).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | FK to User |
| `workspaceId` | String | FK to Workspace |
| `standupTime` | String | Time string, e.g. `"09:00"` |
| `wrapupTime` | String | Time string, e.g. `"17:00"` |
| `standupEnabled` | Boolean | Whether standup is active |
| `wrapupEnabled` | Boolean | Whether wrapup is active |

**Unique constraint**: `userId` + `workspaceId` (one config per user per workspace).

---

## SprintAnalyticsService

Singleton exported as `sprintAnalyticsService`. File: `src/server/services/SprintAnalyticsService.ts`.

| Method | Input | Returns | Description |
|--------|-------|---------|-------------|
| `getActiveSprint` | `workspaceId` | Sprint or null | Finds List with `type=SPRINT`, `status=ACTIVE` |
| `getSprintMetrics` | `listId` | `SprintMetricsResult` | Velocity, kanban counts, completion rate, scope creep detection |
| `getBurndownData` | `listId` | `BurndownPoint[]` | Maps SprintSnapshot records to burndown points with ideal line |
| `detectRiskSignals` | `listId` | `RiskSignal[]` | Checks 5 risk types (see below) |
| `captureDailySnapshot` | `listId` | `DailySnapshotResult` | Upserts snapshot for today with kanban counts + GitHub activity counts |
| `getVelocityHistory` | `workspaceId, count` | Array | Loads completed sprints with cached SprintMetrics |

### Scope Creep Detection

Scope creep is measured by counting actions added after the sprint's `startDate`. This uses the `ActionList.createdAt` timestamp (when the action was added to the sprint list), not the action's own creation date.

### Risk Signal Types

| Risk Type | Trigger Condition |
|-----------|-------------------|
| `scope_creep` | More than 20% of actions added after sprint start |
| `stale_items` | Any action in IN_PROGRESS status for 3+ days |
| `overdue` | Any action past its due date |
| `blocked` | Any action with non-empty `blockedByIds` |
| `velocity_drop` | More than 50% of sprint elapsed but less than 30% of actions complete |

---

## GitHubActivityService

Singleton exported as `githubActivityService`. File: `src/server/services/GitHubActivityService.ts`.

### Webhook Processing

| Method | GitHub Event | What It Stores |
|--------|-------------|----------------|
| `processPushEvent` | `push` | One GitHubActivity per commit, deduped by SHA |
| `processPullRequestEvent` | `pull_request` | One record per PR action (opened, closed, etc.), deduped by `node_id:action` |
| `processPullRequestReviewEvent` | `pull_request_review` | One record per review, deduped by review `node_id` |

### 3-Tier Action Mapping

Each GitHub event is mapped to an Action if possible. The tiers are attempted in order; the first successful match wins.

**Tier 1 — Explicit**: Extracts issue numbers from commit messages (e.g. `fixes #123`), then looks up the `ActionSync` table for a matching GitHub issue. This is the highest-confidence mapping.

**Tier 2 — Branch Name**: Extracts a CUID from the branch name (e.g. `feat/cuid123abc-description`), then verifies the Action exists in the same workspace.

**Tier 3 — Semantic (planned)**: Will use NLP to match commit messages to action names. Not yet implemented.

### Activity Summary

`getActivitySummary(workspaceId, since)` aggregates activity into a summary object:

| Field | Type | Description |
|-------|------|-------------|
| `totalCommits` | number | Total commits since the given date |
| `totalPRsOpened` | number | PRs opened |
| `totalPRsMerged` | number | PRs merged |
| `totalReviews` | number | PR reviews submitted |
| `mappedCount` | number | Events successfully mapped to an Action |
| `unmappedCount` | number | Events with no Action mapping |

---

## tRPC Router: sprintAnalytics

File: `src/server/api/routers/sprintAnalytics.ts`

All endpoints use `apiKeyMiddleware`, which accepts both session JWT (from cookie or `Authorization` header) and API key (`x-api-key` header). This allows both browser clients and server-to-server calls from Mastra.

| Endpoint | Type | Input | Service Method |
|----------|------|-------|----------------|
| `getActiveSprint` | query | `{ workspaceId }` | `sprintAnalyticsService.getActiveSprint` |
| `getMetrics` | query | `{ listId }` | `sprintAnalyticsService.getSprintMetrics` |
| `getBurndown` | query | `{ listId }` | `sprintAnalyticsService.getBurndownData` |
| `getRiskSignals` | query | `{ listId }` | `sprintAnalyticsService.detectRiskSignals` |
| `getVelocityHistory` | query | `{ workspaceId, count? }` | `sprintAnalyticsService.getVelocityHistory` |
| `getGitHubActivity` | query | `{ workspaceId, since }` | `githubActivityService.getActivitySummary` |
| `captureDailySnapshot` | mutation | `{ listId }` | `sprintAnalyticsService.captureDailySnapshot` |

---

## GitHub Webhook Extension

The existing webhook handler at `src/app/api/webhooks/github/route.ts` was extended to handle three new event types:

```
switch (event) {
  case "push":
    githubActivityService.processPushEvent(body, deliveryId)
  case "pull_request":
    githubActivityService.processPullRequestEvent(body, deliveryId)
  case "pull_request_review":
    githubActivityService.processPullRequestReviewEvent(body, deliveryId)
}
```

Each handler is called with the parsed webhook body and the `X-GitHub-Delivery` header ID for traceability.

---

## ActionStatusChange Tracking

When kanban status changes via `action.updateKanbanStatus` or `action.updateKanbanStatusWithOrder`, an `ActionStatusChange` record is created using a non-blocking `.catch()` pattern. This ensures the main mutation is never blocked or failed by audit trail writes:

```typescript
void db.actionStatusChange.create({
  data: {
    actionId,
    previousStatus,
    newStatus,
    changedByUserId: ctx.session.user.id,
  },
}).catch(console.error);
```

---

## How Mastra Consumes This

Mastra's PM tools (in `src/mastra/tools/pm-tools.ts`) call the tRPC endpoints via `authenticatedTrpcCall()`:

```typescript
const { data } = await authenticatedTrpcCall(
  "sprintAnalytics.getMetrics",
  { listId },
  { authToken, sessionId, userId }
);
```

The `authToken` comes from the user's session JWT, passed through Mastra's `requestContext`. For scheduled or automated calls where there is no user context, an API key can be used instead via the `x-api-key` header.

### Authentication Paths

| Caller | Auth Method | Header |
|--------|------------|--------|
| Browser client | Session JWT | `Cookie` or `Authorization: Bearer <jwt>` |
| Mastra (user-initiated) | User session JWT | `Authorization: Bearer <jwt>` |
| Mastra (scheduled/automated) | API key | `x-api-key: <key>` |

---

## File Index

```
src/server/services/
  SprintAnalyticsService.ts          # Sprint metrics, burndown, risk signals, snapshots
  GitHubActivityService.ts           # Webhook processing, action mapping, activity summaries

src/server/api/routers/
  sprintAnalytics.ts                 # tRPC router wrapping both services

src/server/api/middleware/
  apiKeyAuth.ts                      # Dual auth middleware (JWT + API key)

src/app/api/webhooks/github/
  route.ts                           # GitHub webhook handler (extended for push/PR/review)

prisma/
  schema.prisma                      # 5 new models (see Data Models section)
  migrations/
    20260213130545_add_pm_agent_models/  # Migration for all PM agent models
```
