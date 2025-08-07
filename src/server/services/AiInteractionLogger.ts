import { type PrismaClient } from "@prisma/client";

export interface AiInteractionData {
  // Source Information (Required)
  platform: "slack" | "manychat" | "api" | "webhook" | "direct";
  sourceId?: string; // Platform-specific ID (Slack channel, chat session, etc.)

  // User Context
  systemUserId?: string; // Authenticated user ID
  externalUserId?: string; // Platform-specific user ID (Slack user, etc.)
  userName?: string; // Display name for quick reference

  // Message Content (Required)
  userMessage: string; // Original user input
  cleanMessage?: string; // Processed/cleaned message
  aiResponse: string; // AI agent response

  // AI Context
  agentId?: string; // Mastra agent ID
  agentName?: string; // Human-readable agent name
  model?: string; // AI model used (GPT-4, Claude, etc.)

  // Interaction Metadata
  conversationId?: string; // Group related messages
  messageType?: string; // "question", "command", "request", "followup"
  intent?: string; // Classified intent ("list_goals", "create_task", etc.)
  category?: string; // "goals", "projects", "actions", "general"

  // Performance & Quality
  responseTime?: number; // Response time in ms
  tokenUsage?: {
    prompt?: number;
    completion?: number;
    total?: number;
    cost?: number; // Cost in USD
  };
  hadError?: boolean;
  errorMessage?: string;
  confidenceScore?: number; // AI confidence rating (0.0 to 1.0)

  // Context & Results
  projectId?: string; // Associated project
  actionsTaken?: Array<{
    action: string;
    result: string;
    data?: unknown;
  }>;
  toolsUsed?: string[]; // Tools/functions called ["createAction", "retrieveActions"]

  // Additional metadata
  userAgent?: string; // Browser/client information
  ipAddress?: string; // For security/analytics (should be hashed)
}

export interface ConversationContext {
  conversationId: string;
  platform: string;
  systemUserId?: string;
  projectId?: string;
}

export interface LoggingOptions {
  enableDetailedLogging?: boolean;
  includeTokenUsage?: boolean;
  includePerformanceMetrics?: boolean;
  hashIpAddresses?: boolean;
}

/**
 * Centralized service for logging AI interactions across all platforms
 * Provides standardized logging interface for Slack, ManyChat, API calls, etc.
 */
export class AiInteractionLogger {
  constructor(
    private db: PrismaClient,
    private options: LoggingOptions = {
      enableDetailedLogging: true,
      includeTokenUsage: true,
      includePerformanceMetrics: true,
      hashIpAddresses: true,
    }
  ) {}

  /**
   * Log a single AI interaction
   */
  async logInteraction(data: AiInteractionData): Promise<string> {
    try {
      const interaction = await this.db.aiInteractionHistory.create({
        data: {
          // Source Information
          platform: data.platform,
          sourceId: data.sourceId,

          // User Context
          systemUserId: data.systemUserId,
          externalUserId: data.externalUserId,
          userName: data.userName,

          // Message Content
          userMessage: data.userMessage,
          cleanMessage: data.cleanMessage,
          aiResponse: data.aiResponse,

          // AI Context
          agentId: data.agentId,
          agentName: data.agentName,
          model: data.model,

          // Interaction Metadata
          conversationId: data.conversationId,
          messageType: data.messageType,
          intent: data.intent,
          category: data.category,

          // Performance & Quality
          responseTime: data.responseTime,
          tokenUsage: data.tokenUsage ? JSON.stringify(data.tokenUsage) : null,
          hadError: data.hadError ?? false,
          errorMessage: data.errorMessage,
          confidenceScore: data.confidenceScore,

          // Context & Results
          projectId: data.projectId,
          actionsTaken: data.actionsTaken ? JSON.stringify(data.actionsTaken) : null,
          toolsUsed: data.toolsUsed ?? [],

          // Additional metadata
          userAgent: data.userAgent,
          ipAddress: this.options.hashIpAddresses 
            ? this.hashIpAddress(data.ipAddress) 
            : data.ipAddress,
        },
      });

      if (this.options.enableDetailedLogging) {
        console.log(`[AiInteractionLogger] Logged interaction ${interaction.id} from ${data.platform}`);
      }

      return interaction.id;
    } catch (error) {
      console.error("[AiInteractionLogger] Failed to log interaction:", error);
      throw new Error("Failed to log AI interaction");
    }
  }

  /**
   * Start a conversation context for tracking related interactions
   */
  async startConversation(context: ConversationContext): Promise<string> {
    const conversationId = context.conversationId || this.generateConversationId();
    
    if (this.options.enableDetailedLogging) {
      console.log(`[AiInteractionLogger] Started conversation ${conversationId} on ${context.platform}`);
    }

    return conversationId;
  }

  /**
   * Log multiple interactions in a batch (for performance)
   */
  async logBatch(interactions: AiInteractionData[]): Promise<string[]> {
    const interactionIds: string[] = [];
    
    for (const interaction of interactions) {
      try {
        const id = await this.logInteraction(interaction);
        interactionIds.push(id);
      } catch (error) {
        console.error("[AiInteractionLogger] Failed to log batch interaction:", error);
      }
    }

    return interactionIds;
  }

  /**
   * Get interaction statistics for analytics
   */
  async getInteractionStats(filters: {
    systemUserId?: string;
    platform?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const whereClause: any = {};
    
    if (filters.systemUserId) {
      whereClause.systemUserId = filters.systemUserId;
    }
    
    if (filters.platform) {
      whereClause.platform = filters.platform;
    }
    
    if (filters.projectId) {
      whereClause.projectId = filters.projectId;
    }
    
    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) whereClause.createdAt.gte = filters.startDate;
      if (filters.endDate) whereClause.createdAt.lte = filters.endDate;
    }

    const [
      totalInteractions,
      errorCount,
      platformStats,
      agentStats,
      averageResponseTime,
    ] = await Promise.all([
      this.db.aiInteractionHistory.count({ where: whereClause }),
      
      this.db.aiInteractionHistory.count({ 
        where: { ...whereClause, hadError: true } 
      }),
      
      this.db.aiInteractionHistory.groupBy({
        by: ["platform"],
        where: whereClause,
        _count: { platform: true },
      }),
      
      this.db.aiInteractionHistory.groupBy({
        by: ["agentName"],
        where: { ...whereClause, agentName: { not: null } },
        _count: { agentName: true },
      }),
      
      this.db.aiInteractionHistory.aggregate({
        where: { ...whereClause, responseTime: { not: null } },
        _avg: { responseTime: true },
      }),
    ]);

    return {
      totalInteractions,
      errorCount,
      errorRate: totalInteractions > 0 ? (errorCount / totalInteractions) * 100 : 0,
      averageResponseTime: averageResponseTime._avg.responseTime,
      platformBreakdown: platformStats.map(p => ({
        platform: p.platform,
        count: p._count.platform,
      })),
      agentBreakdown: agentStats.map(a => ({
        agentName: a.agentName,
        count: a._count.agentName,
      })),
    };
  }

  /**
   * Get conversation history for a specific conversation
   */
  async getConversationHistory(conversationId: string) {
    return this.db.aiInteractionHistory.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
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
  }

  /**
   * Classify intent from user message (basic implementation)
   * Can be enhanced with ML models later
   */
  classifyIntent(message: string): string | undefined {
    const lowerMessage = message.toLowerCase();
    
    // Goal-related intents
    if (lowerMessage.includes("goal") || lowerMessage.includes("objective")) {
      if (lowerMessage.includes("create") || lowerMessage.includes("add")) {
        return "create_goal";
      }
      if (lowerMessage.includes("list") || lowerMessage.includes("show")) {
        return "list_goals";
      }
      return "goal_related";
    }

    // Project-related intents
    if (lowerMessage.includes("project")) {
      if (lowerMessage.includes("create") || lowerMessage.includes("new")) {
        return "create_project";
      }
      if (lowerMessage.includes("status") || lowerMessage.includes("update")) {
        return "project_status";
      }
      if (lowerMessage.includes("list") || lowerMessage.includes("show")) {
        return "list_projects";
      }
      return "project_related";
    }

    // Task/Action-related intents
    if (lowerMessage.includes("task") || lowerMessage.includes("action") || lowerMessage.includes("todo")) {
      if (lowerMessage.includes("create") || lowerMessage.includes("add")) {
        return "create_task";
      }
      if (lowerMessage.includes("complete") || lowerMessage.includes("done")) {
        return "complete_task";
      }
      if (lowerMessage.includes("list") || lowerMessage.includes("show")) {
        return "list_tasks";
      }
      return "task_related";
    }

    // Status/reporting intents
    if (lowerMessage.includes("status") || lowerMessage.includes("progress") || lowerMessage.includes("report")) {
      return "status_check";
    }

    // Help intents
    if (lowerMessage.includes("help") || lowerMessage.includes("how") || lowerMessage.includes("what")) {
      return "help_request";
    }

    return "general";
  }

  /**
   * Classify category from user message and context
   */
  classifyCategory(message: string, context?: { projectId?: string }): string {
    const intent = this.classifyIntent(message);
    
    if (intent?.includes("goal")) return "goals";
    if (intent?.includes("project")) return "projects";
    if (intent?.includes("task") || intent?.includes("action")) return "actions";
    if (context?.projectId) return "projects"; // If in project context
    
    return "general";
  }

  /**
   * Generate a unique conversation ID
   */
  generateConversationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `conv_${timestamp}_${random}`;
  }

  /**
   * Hash IP address for privacy
   */
  private hashIpAddress(ip?: string): string | undefined {
    if (!ip) return undefined;
    
    // Simple hash for privacy - in production, use a proper crypto hash
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(ip).digest("hex").substring(0, 16);
  }

  /**
   * Helper method to create logging data from common patterns
   */
  static createFromMastraCall(data: {
    platform: "slack" | "manychat" | "api" | "direct";
    userMessage: string;
    aiResponse: string;
    agentId?: string;
    agentName?: string;
    systemUserId?: string;
    projectId?: string;
    conversationId?: string;
    responseTime?: number;
    toolsUsed?: string[];
    hadError?: boolean;
    errorMessage?: string;
    sourceId?: string;
    externalUserId?: string;
    userName?: string;
  }): AiInteractionData {
    return {
      ...data,
      model: "mastra-agents", // Default for Mastra calls
      messageType: "question", // Default type
    };
  }

  /**
   * Helper method to create logging data from Slack interactions
   */
  static createFromSlack(data: {
    userMessage: string;
    aiResponse: string;
    channelId: string;
    slackUserId: string;
    systemUserId?: string;
    userName?: string;
    agentUsed?: string;
    responseTime?: number;
    hadError?: boolean;
    errorMessage?: string;
    category?: string;
    intent?: string;
  }): AiInteractionData {
    return {
      platform: "slack",
      sourceId: data.channelId,
      userMessage: data.userMessage,
      aiResponse: data.aiResponse,
      externalUserId: data.slackUserId,
      systemUserId: data.systemUserId,
      userName: data.userName,
      agentName: data.agentUsed,
      responseTime: data.responseTime,
      hadError: data.hadError,
      errorMessage: data.errorMessage,
      category: data.category,
      intent: data.intent,
      model: "mastra-agents",
      messageType: "command",
    };
  }
}

/**
 * Default instance for use throughout the application
 */
let defaultLogger: AiInteractionLogger | null = null;

export function getAiInteractionLogger(db: PrismaClient): AiInteractionLogger {
  if (!defaultLogger) {
    defaultLogger = new AiInteractionLogger(db);
  }
  return defaultLogger;
}