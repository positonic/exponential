import { db } from '~/server/db';

export class SlackChannelResolver {
  /**
   * Resolve the appropriate Slack channel for a given project/team
   * Priority: Project channel > Team channel > null
   */
  static async resolveChannel(
    projectId?: string, 
    teamId?: string,
    integrationId?: string
  ): Promise<{ channel: string | null; integrationId: string | null }> {
    // 1. Try project-specific channel
    if (projectId) {
      const projectConfig = await db.slackChannelConfig.findUnique({
        where: { projectId },
        include: { integration: true }
      });
      
      if (projectConfig?.isActive && projectConfig.integration.status === 'ACTIVE') {
        return {
          channel: projectConfig.slackChannel,
          integrationId: projectConfig.integrationId
        };
      }
      
      // 2. Fall back to team channel via project
      const project = await db.project.findUnique({
        where: { id: projectId },
        include: { 
          team: { 
            include: { 
              slackConfig: {
                include: { integration: true }
              }
            } 
          } 
        }
      });
      
      if (project?.team?.slackConfig?.isActive && 
          project.team.slackConfig.integration.status === 'ACTIVE') {
        return {
          channel: project.team.slackConfig.slackChannel,
          integrationId: project.team.slackConfig.integrationId
        };
      }
    }
    
    // 3. Direct team channel
    if (teamId) {
      const teamConfig = await db.slackChannelConfig.findUnique({
        where: { teamId },
        include: { integration: true }
      });
      
      if (teamConfig?.isActive && teamConfig.integration.status === 'ACTIVE') {
        return {
          channel: teamConfig.slackChannel,
          integrationId: teamConfig.integrationId
        };
      }
    }
    
    // 4. If specific integration provided, check if it has any config
    if (integrationId) {
      const configs = await db.slackChannelConfig.findMany({
        where: { 
          integrationId,
          isActive: true
        },
        include: { integration: true }
      });
      
      // Return the first active config found
      const activeConfig = configs.find(c => c.integration.status === 'ACTIVE');
      if (activeConfig) {
        return {
          channel: activeConfig.slackChannel,
          integrationId: activeConfig.integrationId
        };
      }
    }
    
    return { channel: null, integrationId: null };
  }

  /**
   * Get all available Slack integrations for a user
   */
  static async getUserSlackIntegrations(userId: string) {
    return await db.integration.findMany({
      where: {
        userId,
        provider: 'slack',
        status: 'ACTIVE'
      },
      include: {
        credentials: {
          where: { keyType: 'BOT_TOKEN' }
        },
        slackChannelConfigs: {
          include: {
            project: true,
            team: true
          }
        }
      }
    });
  }

  /**
   * Validate that a user has permission to send to a specific channel config
   */
  static async validateUserAccess(
    userId: string,
    projectId?: string,
    teamId?: string
  ): Promise<boolean> {
    if (projectId) {
      const project = await db.project.findFirst({
        where: {
          id: projectId,
          OR: [
            // User is the project creator
            { createdById: userId },
            // User is a member of the project's team
            { team: { members: { some: { userId } } } },
            // User is a direct project member
            { projectMembers: { some: { userId } } }
          ]
        }
      });
      return !!project;
    }
    
    if (teamId) {
      const teamMember = await db.teamUser.findFirst({
        where: { userId, teamId }
      });
      return !!teamMember;
    }
    
    return false;
  }

  /**
   * Create or update Slack channel configuration
   */
  static async configureChannel(
    integrationId: string,
    channel: string,
    configuredByUserId: string,
    projectId?: string,
    teamId?: string
  ) {
    // Validate that only one of projectId or teamId is provided
    if ((!projectId && !teamId) || (projectId && teamId)) {
      throw new Error('Must provide either projectId or teamId, not both');
    }

    // Check if config already exists
    const existingConfig = projectId
      ? await db.slackChannelConfig.findUnique({ where: { projectId } })
      : await db.slackChannelConfig.findUnique({ where: { teamId } });

    if (existingConfig) {
      // Update existing config
      return await db.slackChannelConfig.update({
        where: { id: existingConfig.id },
        data: {
          slackChannel: channel,
          integrationId,
          configuredByUserId,
          isActive: true,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new config
      return await db.slackChannelConfig.create({
        data: {
          slackChannel: channel,
          integrationId,
          configuredByUserId,
          projectId,
          teamId,
          isActive: true
        }
      });
    }
  }
}