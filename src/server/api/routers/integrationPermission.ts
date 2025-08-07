import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { IntegrationPermissionService } from "~/server/services/IntegrationPermissionService";
import { TRPCError } from "@trpc/server";

const PermissionTypeSchema = z.enum(['CONFIGURE_CHANNELS', 'VIEW_INTEGRATION', 'USE_IN_WORKFLOWS']);
const PermissionScopeSchema = z.enum(['global', 'team', 'project']);

export const integrationPermissionRouter = createTRPCRouter({
  /**
   * Grant permission to use an integration
   */
  grantPermission: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      grantedToUserId: z.string().optional(),
      grantedToTeamId: z.string().optional(),
      permissions: z.array(PermissionTypeSchema),
      scope: PermissionScopeSchema,
      scopeEntityId: z.string().optional(),
      expiresAt: z.date().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const permission = await IntegrationPermissionService.grantPermission(
          input,
          ctx.session.user.id
        );
        return { success: true, permission };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to grant permission"
        });
      }
    }),

  /**
   * Revoke permission to use an integration
   */
  revokePermission: protectedProcedure
    .input(z.object({
      permissionId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await IntegrationPermissionService.revokePermission(
          input.permissionId,
          ctx.session.user.id
        );
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to revoke permission"
        });
      }
    }),

  /**
   * Get all integrations accessible to the current user
   */
  getAccessibleIntegrations: protectedProcedure
    .input(z.object({
      provider: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await IntegrationPermissionService.getAccessibleIntegrations(
          ctx.session.user.id,
          input.provider
        );
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch accessible integrations"
        });
      }
    }),

  /**
   * Check if user has specific permission for an integration
   */
  hasPermission: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      permission: PermissionTypeSchema,
      context: z.object({
        projectId: z.string().optional(),
        teamId: z.string().optional()
      }).optional()
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await IntegrationPermissionService.hasPermission(
          ctx.session.user.id,
          input.integrationId,
          input.permission,
          input.context
        );
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to check permission"
        });
      }
    }),

  /**
   * Get all permissions for an integration (for management)
   */
  getIntegrationPermissions: protectedProcedure
    .input(z.object({
      integrationId: z.string()
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await IntegrationPermissionService.getIntegrationPermissions(
          input.integrationId,
          ctx.session.user.id
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to fetch permissions"
        });
      }
    }),

  /**
   * Get users and teams that can be granted access (for permission UI)
   */
  getGrantableEntities: protectedProcedure
    .input(z.object({
      integrationId: z.string()
    }))
    .query(async ({ ctx, input }) => {
      // First verify user owns this integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id
        }
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found or you don't own it"
        });
      }

      // Get all users (for individual grants)
      const users = await ctx.db.user.findMany({
        where: {
          NOT: { id: ctx.session.user.id } // Exclude self
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        },
        orderBy: { name: 'asc' }
      });

      // Get teams the user is part of (for team grants)
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true
            }
          }
        }
      });

      return {
        users,
        teams: userTeams.map(ut => ut.team)
      };
    }),

  /**
   * Get permission suggestions for a project/team context
   */
  getPermissionSuggestions: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      teamId: z.string().optional(),
      provider: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const suggestions = [];

      // If project context, suggest project owner needs access
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            team: { select: { id: true, name: true } }
          }
        });

        if (project && project.createdBy.id !== ctx.session.user.id) {
          // Check if project owner already has access to relevant integrations
          const accessibleIntegrations = await IntegrationPermissionService.getAccessibleIntegrations(
            project.createdBy.id,
            input.provider
          );

          if (accessibleIntegrations.length === 0) {
            suggestions.push({
              type: 'project_owner_access',
              title: 'Project owner needs integration access',
              description: `${project.createdBy.name || project.createdBy.email} owns this project but cannot configure integrations`,
              suggestedAction: {
                grantToUserId: project.createdBy.id,
                permissions: ['CONFIGURE_CHANNELS'] as const,
                scope: 'project' as const,
                scopeEntityId: input.projectId
              },
              user: project.createdBy,
              priority: 'high' as const
            });
          }
        }
      }

      // If team context, suggest team admins need access
      if (input.teamId) {
        const teamAdmins = await ctx.db.teamUser.findMany({
          where: {
            teamId: input.teamId,
            role: { in: ['admin', 'owner'] },
            NOT: { userId: ctx.session.user.id }
          },
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        });

        for (const admin of teamAdmins) {
          const accessibleIntegrations = await IntegrationPermissionService.getAccessibleIntegrations(
            admin.user.id,
            input.provider
          );

          if (accessibleIntegrations.length === 0) {
            suggestions.push({
              type: 'team_admin_access',
              title: 'Team admin needs integration access',
              description: `${admin.user.name || admin.user.email} is a team admin but cannot configure integrations`,
              suggestedAction: {
                grantToUserId: admin.user.id,
                permissions: ['CONFIGURE_CHANNELS', 'VIEW_INTEGRATION'] as const,
                scope: 'team' as const,
                scopeEntityId: input.teamId
              },
              user: admin.user,
              priority: 'medium' as const
            });
          }
        }
      }

      return suggestions;
    })
});