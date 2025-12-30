import { db } from "~/server/db";
import { SlackNotificationService } from "./SlackNotificationService";

export interface DigestData {
  period: "daily" | "weekly";
  totalFeedback: number;
  avgRating: number;
  ratingBreakdown: Array<{ rating: number; count: number }>;
  lowRatingAlerts: Array<{
    id: string;
    rating: number;
    content: string | null;
    agentName: string | null;
    userMessage: string | null;
  }>;
  topImprovementSuggestions: Array<{
    id: string;
    title: string;
    feedbackCount: number;
    avgRating: number | null;
  }>;
  newFeatureRequests: number;
}

/**
 * Service for generating and sending feedback digest notifications
 */
export class FeedbackDigestService {
  private static instance: FeedbackDigestService;

  // Private constructor for singleton pattern
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): FeedbackDigestService {
    if (!FeedbackDigestService.instance) {
      FeedbackDigestService.instance = new FeedbackDigestService();
    }
    return FeedbackDigestService.instance;
  }

  /**
   * Generate daily feedback digest data
   */
  async generateDailyDigest(): Promise<DigestData> {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get feedback stats for the last 24 hours
    const [feedbackStats, ratingDistribution, lowRatedFeedback, newRequests] =
      await Promise.all([
        db.feedback.aggregate({
          where: {
            feature: "agent_response",
            createdAt: { gte: dayAgo },
          },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        db.feedback.groupBy({
          by: ["rating"],
          where: {
            feature: "agent_response",
            createdAt: { gte: dayAgo },
          },
          _count: { rating: true },
        }),
        db.feedback.findMany({
          where: {
            feature: "agent_response",
            rating: { lte: 2 },
            createdAt: { gte: dayAgo },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            aiInteraction: {
              select: {
                agentName: true,
                userMessage: true,
              },
            },
          },
        }),
        db.featureRequest.count({
          where: {
            createdAt: { gte: dayAgo },
          },
        }),
      ]);

    // Get top improvement suggestions
    const topSuggestions = await db.featureRequest.findMany({
      where: {
        status: "open",
      },
      orderBy: [{ feedbackCount: "desc" }, { priority: "desc" }],
      take: 3,
      select: {
        id: true,
        title: true,
        feedbackCount: true,
        avgRating: true,
      },
    });

    return {
      period: "daily",
      totalFeedback: feedbackStats._count.rating,
      avgRating: feedbackStats._avg.rating ?? 0,
      ratingBreakdown: ratingDistribution.map((r) => ({
        rating: r.rating,
        count: r._count.rating,
      })),
      lowRatingAlerts: lowRatedFeedback.map((f) => ({
        id: f.id,
        rating: f.rating,
        content: f.content,
        agentName: f.aiInteraction?.agentName ?? null,
        userMessage: f.aiInteraction?.userMessage ?? null,
      })),
      topImprovementSuggestions: topSuggestions,
      newFeatureRequests: newRequests,
    };
  }

  /**
   * Format digest data into Slack blocks
   */
  formatSlackBlocks(digest: DigestData): any[] {
    const blocks: any[] = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 ${digest.period === "daily" ? "Daily" : "Weekly"} Feedback Digest`,
        emoji: true,
      },
    });

    // Summary stats
    const ratingEmoji =
      digest.avgRating >= 4 ? "🟢" : digest.avgRating >= 3 ? "🟡" : "🔴";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Summary*\n` +
          `${ratingEmoji} Average Rating: *${digest.avgRating.toFixed(1)}/5*\n` +
          `📝 Total Feedback: *${digest.totalFeedback}*\n` +
          `✨ New Feature Requests: *${digest.newFeatureRequests}*`,
      },
    });

    // Rating breakdown
    if (digest.ratingBreakdown.length > 0) {
      const ratingText = [5, 4, 3, 2, 1]
        .map((r) => {
          const item = digest.ratingBreakdown.find((d) => d.rating === r);
          const count = item?.count ?? 0;
          const stars = "⭐".repeat(r);
          return `${stars} ${count}`;
        })
        .join("  |  ");

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: ratingText,
          },
        ],
      });
    }

    blocks.push({ type: "divider" });

    // Low rating alerts
    if (digest.lowRatingAlerts.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Low Rating Alerts* (${digest.lowRatingAlerts.length})`,
        },
      });

      for (const alert of digest.lowRatingAlerts.slice(0, 3)) {
        const agentInfo = alert.agentName ? ` via ${alert.agentName}` : "";
        const userQuery = alert.userMessage
          ? `\n_"${alert.userMessage.slice(0, 100)}${alert.userMessage.length > 100 ? "..." : ""}"_`
          : "";

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `🔴 *${alert.rating}/5*${agentInfo}${userQuery}` +
              (alert.content
                ? `\nFeedback: ${alert.content.slice(0, 150)}${alert.content.length > 150 ? "..." : ""}`
                : ""),
          },
        });
      }

      blocks.push({ type: "divider" });
    }

    // Top improvement suggestions
    if (digest.topImprovementSuggestions.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "💡 *Top Improvement Suggestions*",
        },
      });

      for (const suggestion of digest.topImprovementSuggestions) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `• *${suggestion.title}*\n` +
              `  _${suggestion.feedbackCount} feedback${suggestion.feedbackCount !== 1 ? "s" : ""} | ` +
              `Avg rating: ${suggestion.avgRating?.toFixed(1) ?? "N/A"}_`,
          },
        });
      }

      blocks.push({ type: "divider" });
    }

    // Call to action
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📊 View Feedback Dashboard",
          },
          url: `${appUrl}/admin/feedback`,
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "💡 View Feature Requests",
          },
          url: `${appUrl}/admin/feature-requests`,
        },
      ],
    });

    // Footer with weekly review prompt (on Mondays)
    const isMonday = new Date().getDay() === 1;
    if (isMonday) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              "📅 *Weekly Review Ritual*\n" +
              "1. Review top 3 open feature requests\n" +
              "2. Pick 1 to address this week\n" +
              "3. Mark any resolved items as done",
          },
        ],
      });
    }

    return blocks;
  }

  /**
   * Send digest to all admin users via Slack
   */
  async sendDigestToAdmins(): Promise<{
    success: boolean;
    sentTo: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let sentCount = 0;

    try {
      // Generate the digest
      const digest = await this.generateDailyDigest();
      const blocks = this.formatSlackBlocks(digest);

      // Get all admin users with Slack integrations
      const admins = await db.user.findMany({
        where: {
          isAdmin: true,
        },
        include: {
          integrations: {
            where: {
              provider: "slack",
              status: "ACTIVE",
            },
            include: {
              credentials: {
                where: {
                  keyType: "BOT_TOKEN",
                },
                take: 1,
              },
            },
          },
          notificationPreferences: true,
        },
      });

      // Send to each admin
      for (const admin of admins) {
        const slackIntegration = admin.integrations[0];
        if (!slackIntegration) {
          console.log(
            `[FeedbackDigest] Skipping admin ${admin.email} - no Slack integration`
          );
          continue;
        }

        const channel =
          admin.notificationPreferences[0]?.channel ?? "#general";

        const slackService = new SlackNotificationService({
          userId: admin.id,
          integrationId: slackIntegration.id,
          channel,
        });

        const result = await slackService.sendNotification({
          title: "Daily Feedback Digest",
          message: `📊 You have ${digest.totalFeedback} new feedback items with an average rating of ${digest.avgRating.toFixed(1)}/5`,
          priority: digest.avgRating < 3 ? "high" : "normal",
          metadata: {
            blocks: JSON.stringify(blocks),
          },
        });

        if (result.success) {
          sentCount++;
          console.log(`[FeedbackDigest] Sent to admin ${admin.email}`);
        } else {
          errors.push(`Failed to send to ${admin.email}: ${result.error}`);
        }
      }

      return {
        success: errors.length === 0,
        sentTo: sentCount,
        errors,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      errors.push(errorMessage);
      return {
        success: false,
        sentTo: sentCount,
        errors,
      };
    }
  }
}

// Export singleton instance
export const feedbackDigestService = FeedbackDigestService.getInstance();
