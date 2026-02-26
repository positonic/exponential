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
   * Reverse lookup: given a Slack channel ID and bot token, find the associated project.
   * Calls Slack API to resolve channel ID → channel name, then matches against SlackChannelConfig.
   */
  static async resolveProjectFromChannelId(
    channelId: string,
    botToken: string,
    integrationId?: string
  ): Promise<{
    projects: Array<{ id: string; name: string; status: string | null; description: string | null }>;
    teams: Array<{ id: string; name: string }>;
    workspaces: Array<{ id: string; name: string; slug: string; type: string }>;
  }> {
    try {
      // Call Slack API to get channel info (name) from channel ID
      const channelInfoResponse = await fetch(
        `https://slack.com/api/conversations.info?channel=${channelId}`,
        {
          headers: {
            'Authorization': `Bearer ${botToken}`,
          },
        }
      );
      const channelInfo = await channelInfoResponse.json() as { ok: boolean; channel?: { name: string } };

      if (!channelInfo.ok || !channelInfo.channel?.name) {
        console.log(`[SlackChannelResolver] Could not resolve channel name for ${channelId}`);
        return { projects: [], teams: [], workspaces: [] };
      }

      const channelName = `#${channelInfo.channel.name}`;

      // Query all SlackChannelConfigs matching this channel name
      const whereClause: Record<string, unknown> = {
        slackChannel: channelName,
        isActive: true,
      };
      if (integrationId) {
        whereClause.integrationId = integrationId;
      }

      const configs = await db.slackChannelConfig.findMany({
        where: whereClause,
        include: {
          project: {
            select: { id: true, name: true, status: true, description: true },
          },
          team: {
            select: { id: true, name: true },
          },
          workspace: {
            select: { id: true, name: true, slug: true, type: true },
          },
        },
      });

      if (configs.length === 0) {
        console.log(`[SlackChannelResolver] No channel config found for ${channelName}`);
        return { projects: [], teams: [], workspaces: [] };
      }

      const projects = configs
        .map(c => c.project)
        .filter((p): p is NonNullable<typeof p> => p !== null);
      const teams = configs
        .map(c => c.team)
        .filter((t): t is NonNullable<typeof t> => t !== null);
      const workspaces = configs
        .map(c => c.workspace)
        .filter((w): w is NonNullable<typeof w> => w !== null);

      return { projects, teams, workspaces };
    } catch (error) {
      console.error('[SlackChannelResolver] Error resolving project from channel:', error);
      return { projects: [], teams: [], workspaces: [] };
    }
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
            team: true,
            workspace: true
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
    teamId?: string,
    workspaceId?: string
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

    if (workspaceId) {
      const workspaceMember = await db.workspaceUser.findFirst({
        where: { userId, workspaceId }
      });
      return !!workspaceMember;
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
    teamId?: string,
    workspaceId?: string
  ) {
    // Validate that exactly one of projectId, teamId, or workspaceId is provided
    const provided = [projectId, teamId, workspaceId].filter(Boolean);
    if (provided.length !== 1) {
      throw new Error('Must provide exactly one of projectId, teamId, or workspaceId');
    }

    // Check if config already exists
    let existingConfig;
    if (projectId) {
      existingConfig = await db.slackChannelConfig.findUnique({ where: { projectId } });
    } else if (teamId) {
      existingConfig = await db.slackChannelConfig.findUnique({ where: { teamId } });
    } else if (workspaceId) {
      existingConfig = await db.slackChannelConfig.findUnique({ where: { workspaceId } });
    }

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
          workspaceId,
          isActive: true
        }
      });
    }
  }
}