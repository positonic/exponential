import { db } from '~/server/db';
import type { User, Team, Integration } from '@prisma/client';

export enum WhatsAppPermission {
  // Basic permissions
  SEND_MESSAGES = 'whatsapp:send_messages',
  RECEIVE_MESSAGES = 'whatsapp:receive_messages',
  
  // Admin permissions
  MANAGE_PHONE_MAPPINGS = 'whatsapp:manage_phone_mappings',
  VIEW_ALL_CONVERSATIONS = 'whatsapp:view_all_conversations',
  MANAGE_TEMPLATES = 'whatsapp:manage_templates',
  
  // Team permissions
  VIEW_TEAM_CONVERSATIONS = 'whatsapp:view_team_conversations',
  MANAGE_TEAM_MAPPINGS = 'whatsapp:manage_team_mappings',
}

export interface UserRole {
  role: 'owner' | 'admin' | 'member';
  permissions: WhatsAppPermission[];
}

export class WhatsAppPermissionService {
  /**
   * Default permissions for each role
   */
  private static readonly DEFAULT_PERMISSIONS: Record<'owner' | 'admin' | 'member', WhatsAppPermission[]> = {
    owner: [
      WhatsAppPermission.SEND_MESSAGES,
      WhatsAppPermission.RECEIVE_MESSAGES,
      WhatsAppPermission.MANAGE_PHONE_MAPPINGS,
      WhatsAppPermission.VIEW_ALL_CONVERSATIONS,
      WhatsAppPermission.MANAGE_TEMPLATES,
      WhatsAppPermission.VIEW_TEAM_CONVERSATIONS,
      WhatsAppPermission.MANAGE_TEAM_MAPPINGS,
    ],
    admin: [
      WhatsAppPermission.SEND_MESSAGES,
      WhatsAppPermission.RECEIVE_MESSAGES,
      WhatsAppPermission.MANAGE_PHONE_MAPPINGS,
      WhatsAppPermission.VIEW_TEAM_CONVERSATIONS,
      WhatsAppPermission.MANAGE_TEAM_MAPPINGS,
    ],
    member: [
      WhatsAppPermission.SEND_MESSAGES,
      WhatsAppPermission.RECEIVE_MESSAGES,
      WhatsAppPermission.VIEW_TEAM_CONVERSATIONS,
    ],
  };

  /**
   * Check if user has permission for WhatsApp integration
   */
  static async checkPermission(
    userId: string,
    integrationId: string,
    permission: WhatsAppPermission
  ): Promise<boolean> {
    // Get integration with team info
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: {
        team: {
          include: {
            members: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!integration) {
      return false;
    }

    // Personal integration - owner has all permissions
    if (integration.userId === userId && !integration.teamId) {
      return true;
    }

    // Team integration - check team membership and role
    if (integration.teamId && integration.team) {
      const member = integration.team.members[0];
      if (!member) {
        return false;
      }

      const rolePermissions = this.DEFAULT_PERMISSIONS[member.role as 'owner' | 'admin' | 'member'] ?? [];
      return rolePermissions.includes(permission);
    }

    return false;
  }

  /**
   * Get all permissions for a user on an integration
   */
  static async getUserPermissions(
    userId: string,
    integrationId: string
  ): Promise<WhatsAppPermission[]> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: {
        team: {
          include: {
            members: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!integration) {
      return [];
    }

    // Personal integration
    if (integration.userId === userId && !integration.teamId) {
      return this.DEFAULT_PERMISSIONS.owner;
    }

    // Team integration
    if (integration.teamId && integration.team) {
      const member = integration.team.members[0];
      if (!member) {
        return [];
      }

      return this.DEFAULT_PERMISSIONS[member.role as 'owner' | 'admin' | 'member'] ?? [];
    }

    return [];
  }

  /**
   * Check if user can manage phone mappings
   */
  static async canManagePhoneMappings(
    userId: string,
    integrationId: string,
    targetUserId?: string
  ): Promise<boolean> {
    // Check base permission
    const hasPermission = await this.checkPermission(
      userId,
      integrationId,
      WhatsAppPermission.MANAGE_PHONE_MAPPINGS
    );

    if (!hasPermission) {
      return false;
    }

    // If managing own mapping, always allowed
    if (!targetUserId || targetUserId === userId) {
      return true;
    }

    // For team integrations, check if target user is in the same team
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: {
        team: {
          include: {
            members: {
              where: {
                OR: [
                  { userId },
                  { userId: targetUserId },
                ],
              },
            },
          },
        },
      },
    });

    if (!integration?.team) {
      return false;
    }

    // Both users must be in the team
    const userIds = integration.team.members.map(m => m.userId);
    return userIds.includes(userId) && userIds.includes(targetUserId);
  }

  /**
   * Get users that can be mapped for an integration
   */
  static async getMappableUsers(
    userId: string,
    integrationId: string
  ): Promise<Array<{ id: string; name: string | null; email: string | null; role?: string }>> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: {
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!integration) {
      return [];
    }

    // Personal integration - only the owner
    if (!integration.teamId && integration.user) {
      return [integration.user];
    }

    // Team integration - all team members
    if (integration.team) {
      return integration.team.members.map(member => ({
        ...member.user,
        role: member.role,
      }));
    }

    return [];
  }

  /**
   * Filter conversations based on user permissions
   */
  static async filterConversations(
    userId: string,
    integrationId: string,
    conversations: any[]
  ): Promise<any[]> {
    const canViewAll = await this.checkPermission(
      userId,
      integrationId,
      WhatsAppPermission.VIEW_ALL_CONVERSATIONS
    );

    if (canViewAll) {
      return conversations;
    }

    const canViewTeam = await this.checkPermission(
      userId,
      integrationId,
      WhatsAppPermission.VIEW_TEAM_CONVERSATIONS
    );

    if (canViewTeam) {
      // Get team member IDs
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        include: {
          team: {
            include: {
              members: {
                select: { userId: true },
              },
            },
          },
        },
      });

      if (integration?.team) {
        const teamUserIds = integration.team.members.map(m => m.userId);
        return conversations.filter(conv => 
          conv.userId && teamUserIds.includes(conv.userId)
        );
      }
    }

    // Default: only own conversations
    return conversations.filter(conv => conv.userId === userId);
  }

  /**
   * Check if user can send messages on behalf of another user
   */
  static async canSendAsUser(
    senderId: string,
    targetUserId: string,
    integrationId: string
  ): Promise<boolean> {
    // Can always send as self
    if (senderId === targetUserId) {
      return true;
    }

    // Check if sender has admin permissions
    const hasAdminPermission = await this.checkPermission(
      senderId,
      integrationId,
      WhatsAppPermission.MANAGE_PHONE_MAPPINGS
    );

    if (!hasAdminPermission) {
      return false;
    }

    // Verify both users are in the same team
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: {
        team: {
          include: {
            members: {
              where: {
                userId: {
                  in: [senderId, targetUserId],
                },
              },
            },
          },
        },
      },
    });

    return integration?.team?.members.length === 2;
  }
}