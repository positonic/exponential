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
3. They can edit the project (creator, workspace admin+, team admin+)

### Projects

A user can **view** a project if ANY of these are true:
1. They created the project (`createdById`)
2. They are a direct project member
3. They are a member of the project's team
4. They are a member of the project's workspace
5. The project is public

A user can **edit** a project if ANY of these are true:
1. They created the project
2. They are a workspace owner or admin
3. They are a team owner or admin

### Workspaces

Access is based on `WorkspaceUser` membership and role. See the permission mapping table above.

### Teams

Access is based on `TeamUser` membership and role. See the permission mapping table above.

### Goals / Outcomes

Currently **strictly user-owned**. Only the user who created a goal/outcome can read or modify it. Goals are filtered by `userId` and optionally by `workspaceId`.

**Exception**: Outcomes can be shared read-only within organization teams if the user has explicitly enabled `WeeklyReviewSharing` for that team.

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
| `src/server/services/access/resolvers/actionResolver.ts` | Action access + `buildActionAccessWhere()` |

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
