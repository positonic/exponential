# Access Control Architecture

This document describes how authorization works across the application. All access control logic is centralized in `src/server/services/access/`.

**Read this before** modifying any endpoint that checks permissions, membership, or ownership.

---

## Overview

Access to resources is determined through 5 distinct paths:

| Path | Model | Roles | Grants Access To |
|------|-------|-------|------------------|
| **Workspace membership** | `WorkspaceUser` | owner, admin, member, viewer | Projects, Actions, Views, Lists, CRM |
| **Team membership** | `TeamUser` | owner, admin, member | Projects, Actions, OKR Check-ins, Weekly Planning |
| **Project membership** | `ProjectMember` | (role field exists but unused) | Actions within the project |
| **Direct ownership** | `createdById` / `userId` | implicit owner | The specific resource |
| **Admin flag** | `User.isAdmin` | superadmin | Admin-only routes |

Additionally, projects have an `isPublic` flag that grants universal read access.

---

## Role Hierarchy

### Workspace Roles

```
owner (3)   → full control: delete workspace, manage all members/roles, edit settings
admin (2)   → manage members, edit workspace settings, edit all workspace resources
member (1)  → view workspace resources, edit own resources, assign
viewer (0)  → read-only access to workspace resources
```

### Team Roles

```
owner (2)   → full control: delete team, manage all members/roles
admin (1)   → manage members, edit team resources
member (0)  → view team resources, edit assigned resources
```

### Permission Mappings

Each permission requires a minimum role:

| Permission | Workspace Min Role | Team Min Role |
|------------|-------------------|---------------|
| `view` | viewer | member |
| `edit` | member | member |
| `delete` | owner | owner |
| `assign` | member | member |
| `manage_members` | admin | admin |
| `admin` | owner | owner |

---

## How Access is Resolved Per Resource

### Actions

A user can **view** an action if ANY of these are true:
1. They created the action AND it has no assignees
2. They own the agent that created it, and still belong to the action's workspace (see below)
3. They are assigned to the action
4. They are the project creator
5. They are a direct project member (`ProjectMember`)
6. They are a member of the project's team
7. The project is public

A user can **edit** an action if ANY of these are true:
1. They created the action
2. They own the agent that created it, and hold a write role in the action's workspace
3. They are assigned to the action
4. They can edit the project (see Projects below)

A user can **delete** an action if they created it, own the agent that created
it (at a write role in the action's workspace), or can edit its project. Being
assigned is not enough to delete.

Public visibility never grants edit or delete, and neither does a workspace
`viewer` role.

**An action with no project is personal.** Workspace membership grants nothing
on it by itself, whatever the role: only the creator, the owner of the agent
that created it, and the assignees reach it.

**The owner of an agent reaches what the agent created, inside the workspaces
they still belong to.** An External agent or an Assistant writes as its shadow
user (ADR-0049, ADR-0067), so `Action.createdById` is the shadow user, never
the person. Without this path a project-less, unassigned action an agent
created had one reader, the agent: its owner could not find it in search, open
it or complete it, while the agent's key, which the owner holds, could. That is
the delegation invariant upside down.

The path is scoped to the action's workspace (its own `workspaceId`, else its
project's), unlike the creator path:

| The owner's standing in the action's workspace | View | Edit / delete |
|---|---|---|
| `owner`, `admin`, `member`, or team-via-workspace | yes | yes |
| `viewer` | yes | no |
| not a member (removed, or never joined) | no | no |
| the action is in no workspace at all | yes | yes |

An agent leaves a workspace when its owner does (the membership cascades), and
this path leaves with them: owning the agent never reaches rows in a workspace
the owner is no longer in. Per row it is `hasAgentOwnerAccess` /
`canEditAsAgentOwner` on `getActionAccess`; in bulk it is one shared clause in
the three WHERE builders (`createdBy.externalAgentShadow.ownerId` plus
`buildWorkspaceAccessWhere` for reads, `buildWorkspaceWriteWhere` for writes).

Reaching an action is not the same as having it on your plate: Today, the Inbox
and `action.getAll` list what you created or are assigned to. So when an agent
creates an action with no project and no assignee, `createAction` assigns its
owner (`resolveAgentOwnerAssignee`, ADR-0049), provided the owner belongs to
the action's workspace. That is an ordinary assignment, not another access path.

An assignment is not workspace-scoped, though: an assignee keeps view and edit
whatever their standing in the workspace. So the assignment is withdrawn where
the owner's standing changes. `cascadeOwnerRemovedFromWorkspace`, which runs
when a person is removed from a workspace or demoted to `viewer`, also deletes
their `ActionAssignee` rows on the project-less actions their agents created
there (`unassignOwnerFromAgentActionsInWorkspace`). Afterwards the table above
decides again: a viewer reads, someone removed reaches nothing.

### Projects

A user can **view** a project if ANY of these are true:
1. They created the project (`createdById`)
2. They are a direct project member
3. They are a member of the project's team
4. They are a member of the project's workspace
5. The project is public

A user can **edit** a project if ANY of these are true:
1. They created the project
2. They are a direct project member (on a restricted project: `editor` or `admin` role only)
3. They are a member of the project's team (unrestricted projects only)
4. They hold a **write role** in the project's workspace: `owner`, `admin` or
   `member`, or team-via-workspace access (which resolves to `member`). A
   `viewer` gets view through workspace membership, never edit. On a
   restricted project only `owner`/`admin` qualify (the escape hatch).

**Restricted projects** (`Project.isRestricted = true`): paths 3 and 4 above
are revoked — only the creator, explicit `ProjectMember`s, and workspace
owners/admins (escape hatch) retain access. Members of the owning team do
NOT keep access; add them as project members. `isPublic` overrides
restriction for view.

**External agents** (ADR-0049) reach a restricted project only as explicit
`ProjectMember`s — they are never workspace admins, so the escape hatch never
applies. `project.addMember` and `updateMemberRole` admit an agent's shadow user
when it is already a member of the project's workspace, its owner has access to
the project, and the role is `viewer`, or `editor` only if the owner can edit
(`assertAgentProjectMembership`); `removeMember` on a person also removes that
person's agents (`cascadeOwnerRemovedFromProject`), demoting a person to viewer
clamps their agents to viewer (`cascadeOwnerProjectRoleChanged`), and losing the workspace
(`externalAgent.revokeWorkspace`, `cascadeOwnerRemovedFromWorkspace`) drops the
agent's project memberships there (`revokeAgentProjectMembershipsInWorkspace`).
A project refusal is worded by `projectAccessDeniedError`: it names the account
(and its owner for an agent), the project and the missing access, so the person
reading it in a terminal knows what to grant. Use it instead of a bare
"Access denied" wherever a project decides.

### Meetings (TranscriptionSessions)

Resolver: `resolvers/transcriptionResolver.ts` — the single source of truth
for Meeting visibility (see also `CONTEXT.md` "Meeting visibility"). Use
`buildTranscriptionAccessWhere(userId)` for every bulk/aggregate read
(meetings list, weekly stats, related-meeting search, knowledge-chunk
semantic search via `KnowledgeService.search`'s `transcriptionViewerId`) and
`getTranscriptionAccess` + `canViewTranscription`/`canEditTranscription`
for per-row checks. Never write inline meeting permission logic in routers.

A user can **view** a meeting if ANY of these are true:
1. They created it (`TranscriptionSession.userId`)
2. They are a linked Participant on it (`TranscriptionSessionParticipant.userId`)
   — attendance trumps project restriction: people who were in the meeting can
   always view it, even inside a restricted project they can't otherwise access
3. It is assigned to a project they can view (project access is authoritative —
   a workspace member without project access is denied)
4. It has no project and they are a member of its workspace (any role)

A user can **edit** a meeting if ANY of these are true:
1. They created it
2. It is assigned to a project they can edit
3. It has no project and they hold a non-`viewer` role in its workspace

Attendance (path 2 for view) never grants edit.

### Resources

A Resource is owned by the person who saved it (`Resource.userId`), and **every write stays with
the owner**: describing, moving, archiving, deleting, pinning, re-indexing and changing read
state all go through `scopedRows()` in `src/server/api/routers/resource.ts`. The one exception is
**unfile**, which anyone who can edit the Project may do.

Reading has one more path. **Filing shares** ([ADR-0082](../docs/adr/0082-resource-filed-under-a-project-is-shared-with-it.md)):
a user can **view** a Resource if ANY of these are true:

1. They own it
2. It is filed under a Project, and all of:
   - it sits in that Project's workspace (filing sets this)
   - they reach the Project by a membership path (`buildProjectInsiderWhere`: creator, Project
     member, team or workspace member when unrestricted, workspace owner/admin when restricted).
     A public Project's `isPublic` flag is **not** enough
   - its owner still belongs to the Project's workspace, directly or through a team

The rule lives in `resolvers/resourceResolver.ts` (`buildSharedResourceWhere`) and the router's
`visibleRows()`. It applies to `resource.get`, `resource.identities`, `resource.list` when a
`projectId` is given, and the Knowledge search (`resourceSharedWithViewer`), which restates it in
SQL against the live Resource row. Every other list (the Knowledge page, the Reading list) is the
caller's own. Read state is never returned for a Resource the caller does not own.

An **agent principal** gets none of path 2: it works on its owner's rows in the workspaces
delegated to it (ADR-0079). Callers pass `resourceSharedWithViewer` only for a person.

### Workspaces

Access is based on `WorkspaceUser` membership and role. See the permission mapping table above.

### Teams

Access is based on `TeamUser` membership and role. See the permission mapping table above.

### Goals

Currently **strictly user-owned**. Only the user who created a goal can read or modify it. Goals are filtered by `userId` and optionally by `workspaceId`.

### OKR Check-ins

Team-based access. All team members can view and participate. Only the facilitator, team owner, or team admin can start/complete meetings.

---

## Usage Guide

There are three ways to use the access control service, depending on the situation.

### 1. Middleware Approach (preferred for new endpoints)

Chain middleware onto tRPC procedures. Access is checked before the handler runs.

```typescript
import { requireActionAccess, requireWorkspaceMembership } from '~/server/services/access';

// Check action edit access (reads action ID from input.id)
update: protectedProcedure
  .input(z.object({ id: z.string(), name: z.string() }))
  .use(requireActionAccess('edit'))
  .mutation(async ({ ctx, input }) => {
    // Access already verified - ctx.actionAccess available
    return ctx.db.action.update({ where: { id: input.id }, data: { name: input.name } });
  }),

// Check workspace membership (reads workspace ID from input.workspaceId)
list: protectedProcedure
  .input(z.object({ workspaceId: z.string() }))
  .use(requireWorkspaceMembership('view'))
  .mutation(async ({ ctx, input }) => {
    // Access verified - ctx.workspaceAccess available
  }),
```

Available middleware factories:
- `requireActionAccess(permission, idField?)` — checks action access via `input.id`
- `requireWorkspaceMembership(permission, workspaceIdField?)` — checks workspace membership via `input.workspaceId`
- `requireTeamMembership(permission, teamIdField?)` — checks team membership via `input.teamId`
- `requireProjectAccess(permission, projectIdField?)` — checks project access via `input.projectId`
- `requireAccess(resourceType, permission, idField?)` — generic, delegates to `AccessControlService`

### 2. Service Approach (for complex/conditional checks)

Use the `AccessControlService` directly when you need conditional logic or the result.

```typescript
import { AccessControlService } from '~/server/services/access';

const service = new AccessControlService(ctx.db);
const result = await service.canAccess({
  userId: ctx.session.user.id,
  resourceType: 'action',
  resourceId: input.id,
  permission: 'edit',
});

if (!result.allowed) {
  throw new TRPCError({ code: 'FORBIDDEN', message: result.reason });
}
// result.accessPath tells you HOW access was granted (e.g. "owner", "team:admin", "assignee")
```

### 3. Resolver Approach (for Prisma WHERE clauses in bulk queries)

When fetching lists of resources, use `buildActionAccessWhere()` to scope the query.

**`buildActionAccessWhere` is a READ clause.** It admits public-project
outsiders and workspace viewers, so it must never scope a write. For
`updateMany` / `deleteMany`, or for choosing the rows a write will touch, use
the write mirrors:

| Builder | Mirrors | Use for |
|---------|---------|---------|
| `buildActionAccessWhere(userId)` | `canViewAction` | lists, search, lookups |
| `buildActionEditWhere(userId)` | `canEditAction` | bulk updates, assign/unassign |
| `buildActionDeleteWhere(userId)` | `checkActionPermission(…, "delete")` | bulk hard delete |
| `buildProjectEditWhere(userId)` | `canEditProject` | candidate projects for a write |

`src/server/services/access/__tests__/actionWriteWhere.test.ts` property-tests
all three builders against their per-row checks, using `matchesWhere` from
`src/test/prismaWhere.ts`. If you add a path to one side, add it to the other.

```typescript
import { buildActionAccessWhere } from '~/server/services/access';

const actions = await ctx.db.action.findMany({
  where: {
    ...buildActionAccessWhere(ctx.session.user.id),
    status: { notIn: ['DELETED', 'DRAFT'] },
    projectId: input.projectId,
  },
});
```

You can also use individual resolvers for specific checks:

For workspace-scoped **reads**, `assertWorkspaceMembership(db, userId, workspaceId)`
throws `FORBIDDEN` for non-members and admits every role, `viewer` included. Never
put it alone in front of a write.

For workspace-scoped **writes**, membership alone is not enough — `viewer` is a
read-only role. Use `assertWorkspaceWriteRole` (owner/admin/member pass; viewer,
guest and non-member get `FORBIDDEN`) rather than re-checking `role` inline:

```typescript
import { assertWorkspaceWriteRole } from '~/server/services/access';

await assertWorkspaceWriteRole(ctx.db, ctx.session.user.id, workspaceId);
```

The product plugin wraps this as `assertWorkspaceAccess(db, userId, workspaceId, level)`
with a required `"view" | "edit"` level (and the same on its `load*WithAccess`
helpers); every mutation there passes `"edit"`.

```typescript
import { getProjectAccess, hasProjectAccess, canEditProject } from '~/server/services/access';

const access = await getProjectAccess(ctx.db, userId, projectId);
if (!hasProjectAccess(access)) { /* no access */ }
if (!canEditProject(access)) { /* can't edit */ }
// access.teamRole, access.workspaceRole available for fine-grained decisions
```

---

## Adding Access Checks to a New Endpoint

1. **Determine the resource type** — what is being accessed? (action, project, workspace, team)
2. **Determine the permission** — what operation? (`view`, `edit`, `delete`, `assign`, `manage_members`)
3. **Choose the approach**:
   - Single resource by ID → use **middleware** (`.use(requireActionAccess('edit'))`)
   - Conditional/complex logic → use **service** (`AccessControlService.canAccess()`)
   - Bulk query → use **resolver** (`buildActionAccessWhere()`)
4. **Import from** `~/server/services/access` (the barrel index)

### Example: Adding a new action endpoint

```typescript
// In src/server/api/routers/action.ts
import { requireActionAccess } from '~/server/services/access';

archive: protectedProcedure
  .input(z.object({ id: z.string() }))
  .use(requireActionAccess('edit'))  // Checks access before handler runs
  .mutation(async ({ ctx, input }) => {
    return ctx.db.action.update({
      where: { id: input.id },
      data: { status: 'DELETED' },
    });
  }),
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server/services/access/index.ts` | Public API — import everything from here |
| `src/server/services/access/types.ts` | Permission types, role hierarchies, permission mappings |
| `src/server/services/access/AccessControlService.ts` | Main service with `canAccess()` entry point |
| `src/server/services/access/middleware.ts` | tRPC middleware factories |
| `src/server/services/access/resolvers/workspaceResolver.ts` | Workspace membership lookup |
| `src/server/services/access/resolvers/teamResolver.ts` | Team membership lookup |
| `src/server/services/access/resolvers/projectResolver.ts` | Multi-path project access resolution |
| `src/server/services/access/resolvers/resourceResolver.ts` | Resources shared through a Project: `buildSharedResourceWhere()`, `listSharedResourceProjectIds()` |
| `src/server/services/access/resolvers/actionResolver.ts` | Action access + `buildActionAccessWhere()` (read) / `buildActionEditWhere()` / `buildActionDeleteWhere()` (write) |

---

## What a Workspace Viewer Can Still Write

`viewer` is the read-only workspace role, and on the Team plan a viewer is a
free seat, so "a viewer cannot write" is a billing rule as well as an access
rule. Checked in November 2026 (ticket daring.haze). These are the writes a
workspace viewer can still make by an existing rule:

| Write | Why it is allowed | Rule |
|---|---|---|
| Edit an action they created or are assigned to (including its tags) | The creator and assignee paths do not look at the workspace role | "Actions" above |
| Edit a page they own, or one they were granted `editor` on (and its databases and rows) | Ownership and a per-page grant outrank the inherited workspace role | `canEditKnowledgePage` |
| Comment on a page they can view, and resolve or reopen its threads | View access is the commenting gate for pages | `pageComment.ts` |
| Their own notes, favourites, sidebar layout and default workspace | Personal data, not workspace content | n/a |

Feature comments, by contrast, refuse a viewer. Whether page comments and the
creator, assignee and per-page-editor paths should stay open to a free seat is
a product decision, not something to change in passing.

Everything else that creates or changes workspace content must go through
`assertWorkspaceWriteRole` (or a wrapper that delegates to it). A new mutation
that only asserts membership lets a viewer write.

### Known gaps

Not every write is gated yet. These still let a viewer through (ticket
sage.blade); remove a line when its path is fixed:

- `project.create` and `mastra.createProject` check nothing about the
  workspace they are given, so they also admit a non-member
- `mastra.updateProject` (view access, not edit), `mastra.bulkCreateStructure`,
  `mastra.unlinkProjectFromKeyResult`
- `keyResult.updateLinkedFeatures`, `keyResult.unlinkFeature`,
  `goal.updateGoalStatus`
- `pipeline.create`, `transcription.createManualTranscription`
- `workspaceScheduling.createMeeting`, `workspaceScheduling.cancelMeeting`
- `knowledgeChunk.ingestTranscription`, `knowledgeChunk.deleteForSource`
- mutations gated on ownership alone (goals, key results), which a viewer who
  owns the row still passes; not yet read one by one

---

## Migration Status

The centralized service is in place. Routers are being incrementally migrated:

- [x] `action.update` — uses `getActionAccess` / `canEditAction`
- [x] `action.getProjectActions` — uses `getProjectAccess` / `hasProjectAccess`
- [ ] `action.getAll` — still uses inline creator/assignee check (should use `buildActionAccessWhere`)
- [ ] `action.getKanbanActions` — still creator-only (should include assignee/team access)
- [ ] `workspace.ts` — still uses inline role checks
- [ ] `team.ts` — still uses inline role checks
- [ ] `project.ts` — still uses inline checks, write access is creator-only
- [x] `view.ts` / `list.ts` — every write uses `assertWorkspaceWriteRole` (reads still use an inline membership lookup)
- [x] `crmContact.ts` / `crmOrganization.ts` — every write uses `assertWorkspaceWriteRole` (reads still use an inline membership lookup)
- [x] `tag.ts` — `create`, `update`, `setTicketTags`, `setFeatureTags` and `setEntityTags` (ticket, feature, epic) use `assertWorkspaceWriteRole`; tagging an action follows the action edit rule
- [x] `mastra.ts` CRM callbacks (`createCrmContact`, `createFullCrmContact`, `updateCrmContact`, `addCrmInteraction`, `createCrmOrganization`) — need a write role; the workspace fallback never picks one the user only views
- [ ] `okrCheckin.ts` — still uses inline team membership checks
- [x] `epic.ts` — reads use `assertWorkspaceMembership`; writes use `assertWorkspaceWriteRole` (delete also needs admin+ or epic owner)
- [x] `document.ts` — reads use `assertWorkspaceMembership`; create/ingest/delete use `assertWorkspaceWriteRole`
- [x] `sprintAnalytics.ts` — every procedure, including the API-key ones, checks the caller's membership of the target workspace (a list's own workspace for `listId` inputs); `captureDailySnapshot` uses `assertWorkspaceWriteRole`
- [x] product plugin (`src/plugins/product/server/routers/`) — `assertWorkspaceAccess(..., "view" | "edit")`; every mutation passes `"edit"`
