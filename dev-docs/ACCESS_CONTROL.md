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
2. They are assigned to the action
3. They are the project creator
4. They are a direct project member (`ProjectMember`)
5. They are a member of the project's team
6. The project is public

A user can **edit** an action if ANY of these are true:
1. They created the action
2. They are assigned to the action
3. They can edit the project (see Projects below)

A user can **delete** an action if they created it or can edit its project.
Being assigned is not enough to delete.

Public visibility never grants edit or delete, and neither does a workspace
`viewer` role.

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
each write builder against its per-row check, using `matchesWhere` from
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
| `src/server/services/access/resolvers/actionResolver.ts` | Action access + `buildActionAccessWhere()` (read) / `buildActionEditWhere()` / `buildActionDeleteWhere()` (write) |

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
- [ ] `view.ts` / `list.ts` — still uses inline workspace membership checks
- [ ] `crmContact.ts` — still uses inline workspace membership checks
- [ ] `okrCheckin.ts` — still uses inline team membership checks
- [x] `epic.ts` — reads use `assertWorkspaceMembership`; writes use `assertWorkspaceWriteRole` (delete also needs admin+ or epic owner)
- [x] `document.ts` — reads use `assertWorkspaceMembership`; create/ingest/delete use `assertWorkspaceWriteRole`
- [x] `sprintAnalytics.ts` — every procedure, including the API-key ones, checks the caller's membership of the target workspace (a list's own workspace for `listId` inputs); `captureDailySnapshot` uses `assertWorkspaceWriteRole`
- [x] product plugin (`src/plugins/product/server/routers/`) — `assertWorkspaceAccess(..., "view" | "edit")`; every mutation passes `"edit"`
