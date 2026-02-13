/**
 * Centralized Access Control
 *
 * Public API for the access control service.
 *
 * Usage in tRPC routers:
 *
 *   // Middleware approach (preferred for new endpoints):
 *   import { requireActionAccess, requireWorkspaceMembership } from '~/server/services/access';
 *
 *   update: protectedProcedure
 *     .input(z.object({ id: z.string(), ... }))
 *     .use(requireActionAccess('edit'))
 *     .mutation(async ({ ctx, input }) => { ... })
 *
 *   // Service approach (for complex/conditional checks):
 *   import { AccessControlService } from '~/server/services/access';
 *
 *   const service = new AccessControlService(ctx.db);
 *   const result = await service.canAccess({ userId, resourceType: 'action', resourceId, permission: 'edit' });
 *
 *   // Direct resolver approach (for Prisma WHERE clauses):
 *   import { buildActionAccessWhere } from '~/server/services/access';
 *
 *   const actions = await db.action.findMany({ where: { ...buildActionAccessWhere(userId), ... } });
 */

// Main service
export { AccessControlService } from "./AccessControlService";

// Types
export type {
  Permission,
  ResourceType,
  AccessCheckInput,
  AccessResult,
  WorkspaceRole,
  TeamRole,
  ProjectRole,
  WorkspaceMembership,
  TeamMembership,
  ProjectAccess,
} from "./types";

export {
  hasMinimumWorkspaceRole,
  hasMinimumTeamRole,
  WORKSPACE_ROLE_HIERARCHY,
  TEAM_ROLE_HIERARCHY,
  WORKSPACE_PERMISSION_MAP,
  TEAM_PERMISSION_MAP,
} from "./types";

// Middleware
export {
  requireAccess,
  requireActionAccess,
  requireWorkspaceMembership,
  requireTeamMembership,
  requireProjectAccess,
} from "./middleware";

// Resolvers (for direct use when needed)
export { getWorkspaceMembership, isWorkspaceOwner, buildWorkspaceAccessWhere } from "./resolvers/workspaceResolver";
export { getTeamMembership, getUserTeams } from "./resolvers/teamResolver";
export {
  getProjectAccess,
  hasProjectAccess,
  canEditProject,
} from "./resolvers/projectResolver";
export {
  getActionAccess,
  canViewAction,
  canEditAction,
  checkActionPermission,
  buildActionAccessWhere,
} from "./resolvers/actionResolver";
