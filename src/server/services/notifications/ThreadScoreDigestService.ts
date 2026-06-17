import { db } from "~/server/db";
import { SlackNotificationService } from "./SlackNotificationService";
import {
  buildLaneReport,
  type LaneReportEntry,
} from "~/server/services/AgentEvalService";

/**
 * Weekly Thread-score digest (ADR-0012 Phase 2): top Failure lanes with
 * example Threads, so quality regressions surface without anyone checking
 * the dashboard. Mirrors FeedbackDigestService (same Slack-to-admins infra),
 * but reports the JUDGE's apparent-quality verdicts — clearly labelled as
 * such, never blended with human Feedback ratings.
 */

export interface ThreadScoreDigestData {
  period: "weekly";
  scoredThreads: number;
  avgScore: number | null;
  failureCount: number;
  /** Ranked Failure lanes (worst count first) with worst example Threads. */
  laneReport: LaneReportEntry[];
}

export class ThreadScoreDigestService {
  private static instance: ThreadScoreDigestService;

  // Private constructor for singleton pattern
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): ThreadScoreDigestService {
    if (!ThreadScoreDigestService.instance) {
      ThreadScoreDigestService.instance = new ThreadScoreDigestService();
    }
    return ThreadScoreDigestService.instance;
  }

  /** Aggregate the last 7 days of ThreadScores. */
  async generateWeeklyDigest(): Promise<ThreadScoreDigestData> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const scores = await db.threadScore.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: {
        conversationId: true,
        overallScore: true,
        failureLane: true,
        reasoning: true,
        evalCase: { select: { expectation: true } },
      },
    });

    const laneReport = buildLaneReport(
      scores.map((s) => ({
        conversationId: s.conversationId,
        overallScore: s.overallScore,
        failureLane: s.failureLane,
        reasoning: s.reasoning,
        expectation: s.evalCase?.expectation ?? null,
      })),
      3,
    );

    return {
      period: "weekly",
      scoredThreads: scores.length,
      avgScore:
        scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length)
          : null,
      failureCount: scores.filter((s) => s.failureLane !== null).length,
      laneReport,
    };
  }

  /** Format digest data into Slack blocks. */
  formatSlackBlocks(digest: ThreadScoreDigestData): Array<Record<string, unknown>> {
    const blocks: Array<Record<string, unknown>> = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: "🧪 Weekly Thread-Score Digest (LLM judge)",
        emoji: true,
      },
    });

    const scoreEmoji =
      digest.avgScore === null ? "⚪" : digest.avgScore >= 80 ? "🟢" : digest.avgScore >= 60 ? "🟡" : "🔴";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Summary (judge scores — apparent quality, not human ratings)*\n` +
          `${scoreEmoji} Average judge score: *${digest.avgScore ?? "—"}/100*\n` +
          `🧵 Threads scored: *${digest.scoredThreads}*\n` +
          `⚠️ Failures: *${digest.failureCount}*`,
      },
    });

    blocks.push({ type: "divider" });

    if (digest.laneReport.length === 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "✅ No failing Threads this week.",
        },
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "🛣️ *Top Failure lanes*",
        },
      });

      for (const entry of digest.laneReport) {
        const examples = entry.examples
          .map(
            (e) =>
              `  • \`${e.conversationId.slice(0, 24)}\` — *${e.overallScore}/100*` +
              (e.expectation ? `\n    _${e.expectation.slice(0, 120)}_` : "") +
              `\n    ${e.reasoning.slice(0, 150)}${e.reasoning.length > 150 ? "…" : ""}`,
          )
          .join("\n");
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${entry.lane}* — ${entry.count} Thread${entry.count !== 1 ? "s" : ""}\n${examples}`,
          },
        });
      }
    }

    blocks.push({ type: "divider" });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "📊 View Thread-score analytics" },
          url: `${appUrl}/admin/feedback`,
          style: "primary",
        },
      ],
    });

    return blocks;
  }

  /** Send the weekly digest to all admin users via Slack. */
  async sendDigestToAdmins(): Promise<{
    success: boolean;
    sentTo: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let sentCount = 0;

    try {
      const digest = await this.generateWeeklyDigest();
      const blocks = this.formatSlackBlocks(digest);

      const admins = await db.user.findMany({
        where: { isAdmin: true },
        include: {
          integrations: {
            where: { provider: "slack", status: "ACTIVE" },
            include: {
              credentials: { where: { keyType: "BOT_TOKEN" }, take: 1 },
            },
          },
        },
      });

      for (const admin of admins) {
        const slackIntegration = admin.integrations[0];
        if (!slackIntegration) {
          console.log(
            `[ThreadScoreDigest] Skipping admin ${admin.email} - no Slack integration`,
          );
          continue;
        }

        const slackService = new SlackNotificationService({
          userId: admin.id,
          integrationId: slackIntegration.id,
          channel: "#general",
        });

        const result = await slackService.sendNotification({
          title: "Weekly Thread-Score Digest",
          message: `🧪 ${digest.scoredThreads} Threads judge-scored this week, avg ${digest.avgScore ?? "—"}/100, ${digest.failureCount} failures`,
          priority: digest.avgScore !== null && digest.avgScore < 60 ? "high" : "normal",
          metadata: { blocks: JSON.stringify(blocks) },
        });

        if (result.success) {
          sentCount++;
          console.log(`[ThreadScoreDigest] Sent to admin ${admin.email}`);
        } else {
          errors.push(`Failed to send to ${admin.email}: ${result.error}`);
        }
      }

      return { success: errors.length === 0, sentTo: sentCount, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown error");
      return { success: false, sentTo: sentCount, errors };
    }
  }
}

export const threadScoreDigestService = ThreadScoreDigestService.getInstance();
