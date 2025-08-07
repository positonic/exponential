import { db } from '~/server/db';
import { type Integration, type User, type Team, type IntegrationPermission } from '@prisma/client';

export type PermissionType = 'CONFIGURE_CHANNELS' | 'VIEW_INTEGRATION' | 'USE_IN_WORKFLOWS';
export type PermissionScope = 'global' | 'team' | 'project';

export interface GrantPermissionRequest {
  integrationId: string;
  grantedToUserId?: string;
  grantedToTeamId?: string;
  permissions: PermissionType[];
  scope: PermissionScope;
  scopeEntityId?: string;
  expiresAt?: Date;
}

export interface AccessibleIntegration extends Integration {
  accessType: 'owned' | 'shared' | 'team';
  permissions: PermissionType[];
  grantedBy?: User;
}

export class IntegrationPermissionService {
  /**
   * Grant permission to use an integration
   */
  static async grantPermission(
    request: GrantPermissionRequest,
    grantedByUserId: string
  ): Promise<IntegrationPermission> {
    // Validate that only one of user or team is specified
    if ((!request.grantedToUserId && !request.grantedToTeamId) || 
        (request.grantedToUserId && request.grantedToTeamId)) {
      throw new Error('Must specify either grantedToUserId or grantedToTeamId, not both');
    }

    // Validate that the granter owns or has permission to share the integration
    const integration = await db.integration.findFirst({
      where: {
        id: request.integrationId,
        OR: [
          { userId: grantedByUserId },
          { 
            permissions: {
              some: {
                grantedToUserId: grantedByUserId,
                permissions: { has: 'VIEW_INTEGRATION' },
                isActive: true
              }
            }
          }
        ]
      }
    });

    if (!integration) {
      throw new Error('Integration not found or you do not have permission to share it');
    }

    // Check if permission already exists
    const existingPermission = await db.integrationPermission.findFirst({
      where: {
        integrationId: request.integrationId,
        grantedToUserId: request.grantedToUserId,
        grantedToTeamId: request.grantedToTeamId,
        isActive: true
      }
    });

    if (existingPermission) {
      // Update existing permission
      return await db.integrationPermission.update({
        where: { id: existingPermission.id },
        data: {
          permissions: request.permissions,
          scope: request.scope,
          scopeEntityId: request.scopeEntityId,
          expiresAt: request.expiresAt,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new permission
      return await db.integrationPermission.create({
        data: {
          integrationId: request.integrationId,
          grantedToUserId: request.grantedToUserId,
          grantedToTeamId: request.grantedToTeamId,
          grantedByUserId,
          permissions: request.permissions,
          scope: request.scope,
          scopeEntityId: request.scopeEntityId,
          expiresAt: request.expiresAt,
          isActive: true
        }
      });
    }
  }

  /**
   * Revoke permission to use an integration
   */
  static async revokePermission(
    permissionId: string,
    revokedByUserId: string
  ): Promise<void> {
    const permission = await db.integrationPermission.findUnique({
      where: { id: permissionId },
      include: { integration: true }
    });

    if (!permission) {
      throw new Error('Permission not found');
    }

    // Verify that the user can revoke this permission
    // (either the granter, integration owner, or admin)
    if (permission.grantedByUserId !== revokedByUserId &&
        permission.integration.userId !== revokedByUserId) {
      throw new Error('You do not have permission to revoke this access');
    }

    await db.integrationPermission.update({
      where: { id: permissionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedByUserId
      }
    });
  }

  /**
   * Get all integrations accessible to a user (owned + shared)
   */
  static async getAccessibleIntegrations(
    userId: string,
    provider?: string
  ): Promise<AccessibleIntegration[]> {
    // Get user's team memberships
    const userTeams = await db.teamUser.findMany({
      where: { userId },
      select: { teamId: true }
    });
    const teamIds = userTeams.map(ut => ut.teamId);

    // Get owned integrations
    const ownedIntegrations = await db.integration.findMany({
      where: {
        userId,
        ...(provider ? { provider } : {}),
        status: 'ACTIVE'
      },
      include: {
        user: true,
        team: true
      }
    });

    // Get shared integrations (direct grants)
    const sharedIntegrations = await db.integration.findMany({
      where: {
        ...(provider ? { provider } : {}),
        status: 'ACTIVE',
        permissions: {
          some: {
            grantedToUserId: userId,
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          }
        }
      },
      include: {
        user: true,
        team: true,
        permissions: {
          where: {
            grantedToUserId: userId,
            isActive: true
          },
          include: {
            grantedBy: true
          }
        }
      }
    });

    // Get team integrations (through team membership)
    const teamIntegrations = await db.integration.findMany({
      where: {
        teamId: { in: teamIds },
        ...(provider ? { provider } : {}),
        status: 'ACTIVE',
        OR: [
          { allowTeamMemberAccess: true },
          {
            permissions: {
              some: {
                grantedToTeamId: { in: teamIds },
                isActive: true,
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gt: new Date() } }
                ]
              }
            }
          }
        ]
      },
      include: {
        user: true,
        team: true,
        permissions: {
          where: {
            grantedToTeamId: { in: teamIds },
            isActive: true
          },
          include: {
            grantedBy: true
          }
        }
      }
    });

    // Combine and deduplicate
    const allIntegrations = new Map<string, AccessibleIntegration>();

    // Add owned integrations
    ownedIntegrations.forEach(integration => {
      allIntegrations.set(integration.id, {
        ...integration,
        accessType: 'owned' as const,
        permissions: ['CONFIGURE_CHANNELS', 'VIEW_INTEGRATION', 'USE_IN_WORKFLOWS'] as PermissionType[]
      });
    });

    // Add shared integrations
    sharedIntegrations.forEach(integration => {
      if (!allIntegrations.has(integration.id)) {
        const permission = integration.permissions[0];
        allIntegrations.set(integration.id, {
          ...integration,
          accessType: 'shared' as const,
          permissions: permission?.permissions as PermissionType[],
          grantedBy: permission?.grantedBy
        });
      }
    });

    // Add team integrations
    teamIntegrations.forEach(integration => {
      if (!allIntegrations.has(integration.id)) {
        const permission = integration.permissions[0];
        const permissions = integration.allowTeamMemberAccess 
          ? ['CONFIGURE_CHANNELS', 'VIEW_INTEGRATION', 'USE_IN_WORKFLOWS'] as PermissionType[]
          : (permission?.permissions as PermissionType[] || ['USE_IN_WORKFLOWS']);
          
        allIntegrations.set(integration.id, {
          ...integration,
          accessType: 'team' as const,
          permissions,
          grantedBy: permission?.grantedBy
        });
      }
    });

    return Array.from(allIntegrations.values());
  }

  /**
   * Check if user has specific permission for an integration
   */
  static async hasPermission(
    userId: string,
    integrationId: string,
    permission: PermissionType,
    context?: {
      projectId?: string;
      teamId?: string;
    }
  ): Promise<boolean> {
    // Check if user owns the integration
    const ownedIntegration = await db.integration.findFirst({
      where: {
        id: integrationId,
        userId,
        status: 'ACTIVE'
      }
    });

    if (ownedIntegration) {
      return true; // Owners have all permissions
    }

    // Get user's team memberships
    const userTeams = await db.teamUser.findMany({
      where: { userId },
      select: { teamId: true }
    });
    const teamIds = userTeams.map(ut => ut.teamId);

    // Check team integration with allowTeamMemberAccess
    const teamIntegration = await db.integration.findFirst({
      where: {
        id: integrationId,
        teamId: { in: teamIds },
        allowTeamMemberAccess: true,
        status: 'ACTIVE'
      }
    });

    if (teamIntegration) {
      return true; // Team members with allowTeamMemberAccess have all permissions
    }

    // Check explicit permissions
    const whereConditions: any = {
      integrationId,
      isActive: true,
      permissions: { has: permission },
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        {
          OR: [
            { grantedToUserId: userId },
            { grantedToTeamId: { in: teamIds } }
          ]
        }
      ]
    };

    // Add scope conditions based on context
    if (context?.projectId) {
      whereConditions.AND.push({
        OR: [
          { scope: 'global' },
          { scope: 'project', scopeEntityId: context.projectId }
        ]
      });
    } else if (context?.teamId) {
      whereConditions.AND.push({
        OR: [
          { scope: 'global' },
          { scope: 'team', scopeEntityId: context.teamId }
        ]
      });
    }

    const explicitPermission = await db.integrationPermission.findFirst({
      where: whereConditions
    });

    return !!explicitPermission;
  }

  /**
   * Get all permissions for an integration (for management UI)
   */
  static async getIntegrationPermissions(
    integrationId: string,
    requesterId: string
  ): Promise<IntegrationPermission[]> {
    // Verify requester has access to manage this integration
    const integration = await db.integration.findFirst({
      where: {
        id: integrationId,
        userId: requesterId
      }
    });

    if (!integration) {
      throw new Error('Integration not found or you do not have permission to manage it');
    }

    return await db.integrationPermission.findMany({
      where: {
        integrationId,
        isActive: true
      },
      include: {
        grantedToUser: true,
        grantedToTeam: true,
        grantedBy: true,
        revokedBy: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Auto-grant permissions to team admins when team integration is created
   */
  static async autoGrantTeamPermissions(
    integrationId: string,
    teamId: string,
    grantedByUserId: string
  ): Promise<void> {
    // Get team admins and owners
    const teamAdmins = await db.teamUser.findMany({
      where: {
        teamId,
        role: { in: ['admin', 'owner'] }
      }
    });

    // Grant permissions to each admin
    for (const admin of teamAdmins) {
      if (admin.userId !== grantedByUserId) { // Don't grant to self
        try {
          await this.grantPermission({
            integrationId,
            grantedToUserId: admin.userId,
            permissions: ['CONFIGURE_CHANNELS', 'VIEW_INTEGRATION'],
            scope: 'team',
            scopeEntityId: teamId
          }, grantedByUserId);
        } catch (error) {
          console.warn(`Failed to auto-grant permission to team admin ${admin.userId}:`, error);
        }
      }
    }
  }
}