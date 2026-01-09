import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getAiInteractionLogger, type AiInteractionData } from "~/server/services/AiInteractionLogger";

// Zod schema for AI interaction logging
const AiInteractionSchema = z.object({
  // Source Information (Required)
  platform: z.enum(["slack", "manychat", "api", "webhook", "direct"]),
  sourceId: z.string().optional(), // Platform-specific ID

  // User Context  
  systemUserId: z.string().optional(), // Will be overridden by session user ID
  externalUserId: z.string().optional(), // Platform-specific user ID
  userName: z.string().optional(), // Display name

  // Message Content (Required)
  userMessage: z.string().min(1), // Original user input
  cleanMessage: z.string().optional(), // Processed/cleaned message
  aiResponse: z.string().min(1), // AI agent response

  // AI Context
  agentId: z.string().optional(), // Mastra agent ID
  agentName: z.string().optional(), // Human-readable agent name
  model: z.string().optional(), // AI model used

  // Interaction Metadata
  conversationId: z.string().optional(), // Group related messages
  messageType: z.string().optional(), // "question", "command", "request", "followup"
  intent: z.string().optional(), // Classified intent
  category: z.string().optional(), // "goals", "projects", "actions", "general"

  // Performance & Quality
  responseTime: z.number().optional(), // Response time in ms
  tokenUsage: z.object({
    prompt: z.number().optional(),
    completion: z.number().optional(),
    total: z.number().optional(),
    cost: z.number().optional(),
  }).optional(),
  hadError: z.boolean().optional(),
  errorMessage: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional(), // 0.0 to 1.0

  // Context & Results
  projectId: z.string().optional(), // Associated project
  actionsTaken: z.array(z.object({
    action: z.string(),
    result: z.string(),
    data: z.any().optional(),
  })).optional(),
  toolsUsed: z.array(z.string()).optional(), // Tools/functions called

  // Additional metadata
  userAgent: z.string().optional(), // Browser/client information
  ipAddress: z.string().optional(), // For security/analytics (will be hashed)
});

export const aiInteractionRouter = createTRPCRouter({
  /**
   * Log a single AI interaction
   */
  logInteraction: protectedProcedure
    .input(AiInteractionSchema)
    .mutation(async ({ ctx, input }) => {
      const logger = getAiInteractionLogger(ctx.db);

      // Override system user ID with authenticated user
      const interactionData: AiInteractionData = {
        ...input,
        systemUserId: ctx.session.user.id, // Always use authenticated user
      };

      try {
        const interactionId = await logger.logInteraction(interactionData);
        return { success: true, interactionId };
      } catch (error) {
        console.error("[aiInteractionRouter] Failed to log interaction:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to log interaction",
        });
      }
    }),

  /**
   * Get interaction history with pagination and filtering
   */
  getInteractionHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().nullish(),
        platform: z.enum(["slack", "manychat", "api", "webhook", "direct"]).optional(),
        projectId: z.string().optional(),
        agentName: z.string().optional(),
        conversationId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = {
        systemUserId: ctx.session.user.id, // Only user's own interactions
      };

      // Apply filters
      if (input.platform) {
        where.platform = input.platform;
      }
      if (input.projectId) {
        where.projectId = input.projectId;
      }
      if (input.agentName) {
        where.agentName = input.agentName;
      }
      if (input.conversationId) {
        where.conversationId = input.conversationId;
      }
      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) where.createdAt.gte = input.startDate;
        if (input.endDate) where.createdAt.lte = input.endDate;
      }

      const interactions = await ctx.db.aiInteractionHistory.findMany({
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
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (interactions.length > input.limit) {
        const nextItem = interactions.pop();
        nextCursor = nextItem!.id;
      }

      return {
        interactions: interactions.map(interaction => ({
          ...interaction,
          tokenUsage: interaction.tokenUsage ? JSON.parse(interaction.tokenUsage as string) : null,
          actionsTaken: interaction.actionsTaken ? JSON.parse(interaction.actionsTaken as string) : null,
        })),
        nextCursor,
      };
    }),

  /**
   * Get interaction statistics
   */
  getInteractionStats: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["slack", "manychat", "api", "webhook", "direct"]).optional(),
        projectId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const logger = getAiInteractionLogger(ctx.db);

      const filters = {
        systemUserId: ctx.session.user.id, // Only user's own interactions
        platform: input.platform,
        projectId: input.projectId,
        startDate: input.startDate,
        endDate: input.endDate,
      };

      try {
        const stats = await logger.getInteractionStats(filters);
        return stats;
      } catch (error) {
        console.error("[aiInteractionRouter] Failed to get stats:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get interaction statistics",
        });
      }
    }),

  /**
   * Get conversation history for a specific conversation
   */
  getConversationHistory: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const logger = getAiInteractionLogger(ctx.db);

      try {
        const history = await logger.getConversationHistory(input.conversationId);
        
        // Filter to only include interactions from the authenticated user
        const userHistory = history.filter(
          interaction => interaction.systemUserId === ctx.session.user.id
        );

        return userHistory.map(interaction => ({
          ...interaction,
          tokenUsage: interaction.tokenUsage ? JSON.parse(interaction.tokenUsage as string) : null,
          actionsTaken: interaction.actionsTaken ? JSON.parse(interaction.actionsTaken as string) : null,
        }));
      } catch (error) {
        console.error("[aiInteractionRouter] Failed to get conversation history:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get conversation history",
        });
      }
    }),

  /**
   * Get unique platforms, agents, and projects for filtering UI
   */
  getFilterOptions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [platforms, agents, projects] = await Promise.all([
      ctx.db.aiInteractionHistory.groupBy({
        by: ["platform"],
        where: { systemUserId: userId },
        _count: { platform: true },
      }),

      ctx.db.aiInteractionHistory.groupBy({
        by: ["agentName"],
        where: { 
          systemUserId: userId,
          agentName: { not: null },
        },
        _count: { agentName: true },
      }),

      ctx.db.aiInteractionHistory.groupBy({
        by: ["projectId"],
        where: { 
          systemUserId: userId,
          projectId: { not: null },
        },
        _count: { projectId: true },
      }),
    ]);

    return {
      platforms: platforms.map(p => ({
        platform: p.platform,
        count: p._count.platform,
      })),
      agents: agents.map(a => ({
        agentName: a.agentName!,
        count: a._count.agentName,
      })),
      projects: projects.map(p => ({
        projectId: p.projectId!,
        count: p._count.projectId,
      })),
    };
  }),

  /**
   * Get list of conversations for sidebar (unique conversationIds with first message as title)
   */
  getConversationList: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 20;
      const search = input?.search;

      // Build where clause
      const whereClause: any = {
        systemUserId: userId,
        conversationId: { not: null },
      };

      if (search) {
        whereClause.userMessage = { contains: search, mode: 'insensitive' };
      }

      // Get conversations with their first message (oldest) for title
      // Group by conversationId and get the earliest message
      const conversations = await ctx.db.aiInteractionHistory.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
        distinct: ['conversationId'],
        select: {
          conversationId: true,
          userMessage: true,
          createdAt: true,
          agentName: true,
        },
      });

      // Get latest activity for each conversation
      const conversationIds = conversations.map(c => c.conversationId).filter(Boolean) as string[];

      const latestActivities = await ctx.db.aiInteractionHistory.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: conversationIds },
        },
        _max: {
          createdAt: true,
        },
      });

      // Combine and sort by latest activity
      const result = conversations
        .filter(c => c.conversationId)
        .map(conv => {
          const lastActivity = latestActivities.find(
            l => l.conversationId === conv.conversationId
          )?._max.createdAt;

          return {
            conversationId: conv.conversationId!,
            title: conv.userMessage.slice(0, 50) + (conv.userMessage.length > 50 ? '...' : ''),
            createdAt: conv.createdAt,
            lastActivity: lastActivity ?? conv.createdAt,
            agentName: conv.agentName,
          };
        })
        .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
        .slice(0, limit);

      return result;
    }),

  /**
   * Start a new conversation and return conversation ID
   */
  startConversation: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["slack", "manychat", "api", "webhook", "direct"]),
        projectId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const logger = getAiInteractionLogger(ctx.db);

      const conversationId = await logger.startConversation({
        conversationId: logger.generateConversationId(), // Will need to expose this method
        platform: input.platform,
        systemUserId: ctx.session.user.id,
        projectId: input.projectId,
      });

      return { conversationId };
    }),
});