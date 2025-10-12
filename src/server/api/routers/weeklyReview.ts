import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { WeeklyReviewSummaryService } from "~/server/services/WeeklyReviewSummaryService";
import { SlackNotificationService } from "~/server/services/notifications/SlackNotificationService";
import { SlackChannelResolver } from "~/server/services/SlackChannelResolver";

export const weeklyReviewRouter = createTRPCRouter({
  
  // Get user's sharing settings for all teams
  getSharingSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const sharingSettings = await ctx.db.weeklyReviewSharing.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              isOrganization: true,
            },
          },
        },
      });

      return sharingSettings;
    }),

  // Get teams where user has enabled sharing (for shareable links)
  getSharedTeams: protectedProcedure
    .query(async ({ ctx }) => {
      const sharedTeams = await ctx.db.weeklyReviewSharing.findMany({
        where: {
          userId: ctx.session.user.id,
          isEnabled: true,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              isOrganization: true,
            },
          },
        },
      });

      return sharedTeams;
    }),

  // Get user's organization teams (for sharing options)
  getOrganizationTeams: protectedProcedure
    .query(async ({ ctx }) => {
      const organizationTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
          team: {
            isOrganization: true,
          },
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              isOrganization: true,
            },
          },
        },
      });

      // Filter out null teams and flatten the structure
      return organizationTeams
        .map(membership => membership.team)
        .filter(Boolean);
    }),

  // Enable/disable sharing with a specific team
  updateSharingWithTeam: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user is member of the team
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
        include: {
          team: {
            select: {
              isOrganization: true,
            },
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of this team to share weekly reviews',
        });
      }

      if (!membership.team.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews can only be shared with organization teams',
        });
      }

      // Upsert sharing setting
      const sharingSettings = await ctx.db.weeklyReviewSharing.upsert({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
        update: {
          isEnabled: input.isEnabled,
        },
        create: {
          userId: ctx.session.user.id,
          teamId: input.teamId,
          isEnabled: input.isEnabled,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return sharingSettings;
    }),

  // Get shared weekly reviews for a specific team (used by team dashboard)
  getTeamSharedReviews: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      weekStartDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user is member of the team
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
        include: {
          team: {
            select: {
              isOrganization: true,
            },
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of this team to view shared weekly reviews',
        });
      }

      if (!membership.team.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews are only available for organization teams',
        });
      }

      // Get all users sharing with this team
      const sharedReviews = await ctx.db.weeklyReviewSharing.findMany({
        where: {
          teamId: input.teamId,
          isEnabled: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // TODO: In a future iteration, we could fetch actual weekly review data
      // For now, we just return who is sharing and their basic info
      return sharedReviews;
    }),

  // Bulk enable sharing with multiple teams
  enableSharingWithTeams: protectedProcedure
    .input(z.object({
      teamIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user is member of all teams and they are organizations
      const memberships = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
          teamId: {
            in: input.teamIds,
          },
        },
        include: {
          team: {
            select: {
              id: true,
              isOrganization: true,
            },
          },
        },
      });

      if (memberships.length !== input.teamIds.length) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of all teams to enable sharing',
        });
      }

      const nonOrgTeams = memberships.filter(m => !m.team.isOrganization);
      if (nonOrgTeams.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews can only be shared with organization teams',
        });
      }

      // Enable sharing for all teams
      const results = await Promise.all(
        input.teamIds.map(teamId =>
          ctx.db.weeklyReviewSharing.upsert({
            where: {
              userId_teamId: {
                userId: ctx.session.user.id,
                teamId,
              },
            },
            update: {
              isEnabled: true,
            },
            create: {
              userId: ctx.session.user.id,
              teamId,
              isEnabled: true,
            },
          })
        )
      );

      return results;
    }),

  /**
   * Send weekly review summary to Slack
   */
  sendWeeklyReviewToSlack: protectedProcedure
    .input(z.object({
      weekStart: z.string().optional(), // ISO date string
      channelOverride: z.string().optional(), // specific channel like "#general"
      integrationId: z.string().optional() // specific integration to use
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      
      // Parse week start date if provided
      const weekStart = input.weekStart ? new Date(input.weekStart) : undefined;
      
      // Generate weekly review summary
      const summaryService = new WeeklyReviewSummaryService();
      const summary = await summaryService.generateWeeklyReviewSummary(userId, weekStart);
      
      // Determine which Slack integration and channel to use
      let integrationId = input.integrationId;
      let channel = input.channelOverride;
      
      if (!integrationId || !channel) {
        // Get user's Slack integrations
        const userIntegrations = await SlackChannelResolver.getUserSlackIntegrations(userId);
        
        if (userIntegrations.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No Slack integration found. Please configure a Slack integration first.',
          });
        }
        
        // Use the first available integration if none specified
        if (!integrationId) {
          integrationId = userIntegrations[0]!.id;
        }
        
        // Try to resolve channel for this integration
        if (!channel) {
          const channelConfig = await SlackChannelResolver.resolveChannel(
            undefined, // no specific project
            undefined, // no specific team
            integrationId
          );
          
          if (channelConfig.channel) {
            channel = channelConfig.channel;
          } else {
            channel = '#general'; // Default fallback
          }
        }
      }
      
      if (!integrationId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No Slack integration found. Please configure a Slack integration first.',
        });
      }
      
      if (!channel) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Slack channel configured. Please specify a channel or configure default channels.',
        });
      }
      
      // Send to Slack using SlackNotificationService
      const slackService = new SlackNotificationService({
        userId,
        integrationId,
        channel
      });
      
      // Test connection first
      const connectionTest = await slackService.testConnection();
      if (!connectionTest.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Slack connection failed: ${connectionTest.error}`,
        });
      }
      
      // Send the notification
      const result = await slackService.sendNotification({
        title: summary.title,
        message: summary.message,
        metadata: {
          type: 'weekly_review',
          weekStart: summary.weekStart.toISOString(),
          weekEnd: summary.weekEnd.toISOString(),
          userId
        }
      });
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send weekly review to Slack: ${result.error}`,
        });
      }
      
      return {
        success: true,
        message: `Weekly review sent successfully to ${channel}`,
        channel,
        integrationId,
        messageId: result.messageId,
        summary: {
          title: summary.title,
          weekStart: summary.weekStart,
          weekEnd: summary.weekEnd
        }
      };
    }),

  /**
   * Get preview of weekly review summary without sending
   */
  getWeeklyReviewPreview: protectedProcedure
    .input(z.object({
      weekStart: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const weekStart = input.weekStart ? new Date(input.weekStart) : undefined;
      
      const summaryService = new WeeklyReviewSummaryService();
      const summary = await summaryService.generateWeeklyReviewSummary(userId, weekStart);
      
      // Get available Slack integrations
      const availableIntegrations = await SlackChannelResolver.getUserSlackIntegrations(userId);
      
      // Try to get default channel from first integration
      let defaultChannel = '#general';
      if (availableIntegrations.length > 0) {
        try {
          const channelConfig = await SlackChannelResolver.resolveChannel(
            undefined,
            undefined,
            availableIntegrations[0]!.id
          );
          if (channelConfig.channel) {
            defaultChannel = channelConfig.channel;
          }
        } catch {
          // Use fallback
        }
      }
      
      return {
        summary,
        availableIntegrations,
        defaultChannel
      };
    }),

  /**
   * Get available Slack channels for the user
   */
  getAvailableSlackChannels: protectedProcedure
    .input(z.object({
      integrationId: z.string()
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      
      // Verify user has access to this integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: userId,
          provider: 'slack',
          status: 'ACTIVE'
        }
      });
      
      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Slack integration not found or access denied',
        });
      }
      
      // Get available channels
      const slackService = new SlackNotificationService({
        userId,
        integrationId: input.integrationId
      });
      
      const channels = await slackService.getAvailableChannels();
      return channels;
    }),
});