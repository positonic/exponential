import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { SlackChannelResolver } from "~/server/services/SlackChannelResolver";
import { IntegrationPermissionService } from "~/server/services/IntegrationPermissionService";
import { SlackNotificationService } from "~/server/services/notifications/SlackNotificationService";

export const slackRouter = createTRPCRouter({
  getChannelConfig: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        teamId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!input.projectId && !input.teamId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either projectId or teamId must be provided",
        });
      }

      // Verify user has access
      const hasAccess = await SlackChannelResolver.validateUserAccess(
        ctx.session.user.id,
        input.projectId,
        input.teamId
      );

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      const config = await ctx.db.slackChannelConfig.findUnique({
        where: input.projectId 
          ? { projectId: input.projectId }
          : { teamId: input.teamId },
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              status: true,
            }
          }
        }
      });

      return config;
    }),

  configureChannel: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        channel: z.string(),
        isActive: z.boolean().default(true),
        projectId: z.string().optional(),
        teamId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.projectId && !input.teamId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either projectId or teamId must be provided",
        });
      }

      // Check if user has permission to configure channels for this integration
      const hasPermission = await IntegrationPermissionService.hasPermission(
        ctx.session.user.id,
        input.integrationId,
        'CONFIGURE_CHANNELS',
        {
          projectId: input.projectId,
          teamId: input.teamId
        }
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to configure channels for this integration",
        });
      }

      // Get the integration to ensure it exists and is active
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          provider: "slack",
          status: "ACTIVE",
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found or inactive",
        });
      }

      // Verify user has access to the project/team
      const hasAccess = await SlackChannelResolver.validateUserAccess(
        ctx.session.user.id,
        input.projectId,
        input.teamId
      );

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied to project/team",
        });
      }

      // Configure the channel
      const config = await SlackChannelResolver.configureChannel(
        input.integrationId,
        input.channel,
        ctx.session.user.id,
        input.projectId,
        input.teamId
      );

      // Update the isActive status if different
      if (config.isActive !== input.isActive) {
        await ctx.db.slackChannelConfig.update({
          where: { id: config.id },
          data: { isActive: input.isActive },
        });
      }

      return { success: true };
    }),

  removeChannelConfig: protectedProcedure
    .input(z.object({ configId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Find the config and verify ownership
      const config = await ctx.db.slackChannelConfig.findUnique({
        where: { id: input.configId },
        include: {
          integration: true,
          project: true,
          team: true,
        },
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Configuration not found",
        });
      }

      // Verify user has access
      const hasAccess = await SlackChannelResolver.validateUserAccess(
        ctx.session.user.id,
        config.projectId || undefined,
        config.teamId || undefined
      );

      if (!hasAccess || config.integration.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      // Delete the configuration
      await ctx.db.slackChannelConfig.delete({
        where: { id: input.configId },
      });

      return { success: true };
    }),

  getAvailableChannels: protectedProcedure
    .input(z.object({ integrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify user owns the integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
          provider: "slack",
          status: "ACTIVE",
        },
        include: {
          credentials: {
            where: { keyType: "BOT_TOKEN" },
            take: 1,
          },
        },
      });

      if (!integration || integration.credentials.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found or not properly configured",
        });
      }

      // Create Slack service and get channels
      try {
        const slackService = new SlackNotificationService({
          userId: ctx.session.user.id,
          integrationId: input.integrationId,
        });

        const channels = await slackService.getAvailableChannels();
        return channels;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch channels from Slack",
        });
      }
    }),

  testChannelAccess: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        channel: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user owns the integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
          provider: "slack",
          status: "ACTIVE",
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      try {
        const slackService = new SlackNotificationService({
          userId: ctx.session.user.id,
          integrationId: input.integrationId,
          channel: input.channel,
        });

        const testResult = await slackService.testConnection();
        return testResult;
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  getUserSlackIntegrations: protectedProcedure.query(async ({ ctx }) => {
    const integrations = await SlackChannelResolver.getUserSlackIntegrations(
      ctx.session.user.id
    );

    return integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      status: integration.status,
      channelConfigs: integration.slackChannelConfigs.map((config) => ({
        id: config.id,
        channel: config.slackChannel,
        isActive: config.isActive,
        project: config.project ? {
          id: config.project.id,
          name: config.project.name,
        } : null,
        team: config.team ? {
          id: config.team.id,
          name: config.team.name,
        } : null,
      })),
    }));
  }),

  getMessageHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().nullish(),
        channelId: z.string().optional(),
        category: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = {
        systemUserId: ctx.session.user.id,
        ...(input.channelId && { channelId: input.channelId }),
        ...(input.category && { category: input.category }),
      };

      const messages = await ctx.db.slackMessageHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (messages.length > input.limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem!.id;
      }

      return {
        messages,
        nextCursor,
      };
    }),

  getMessageStats: protectedProcedure.query(async ({ ctx }) => {
    const totalMessages = await ctx.db.slackMessageHistory.count({
      where: { systemUserId: ctx.session.user.id },
    });

    const categoryCounts = await ctx.db.slackMessageHistory.groupBy({
      by: ["category"],
      where: { systemUserId: ctx.session.user.id },
      _count: { category: true },
    });

    const channelCounts = await ctx.db.slackMessageHistory.groupBy({
      by: ["channelType"],
      where: { systemUserId: ctx.session.user.id },
      _count: { channelType: true },
    });

    const errorCount = await ctx.db.slackMessageHistory.count({
      where: { 
        systemUserId: ctx.session.user.id,
        hadError: true,
      },
    });

    return {
      totalMessages,
      categoryBreakdown: categoryCounts.map(c => ({
        category: c.category || "unknown",
        count: c._count.category,
      })),
      channelBreakdown: channelCounts.map(c => ({
        channelType: c.channelType,
        count: c._count.channelType,
      })),
      errorCount,
    };
  }),
});