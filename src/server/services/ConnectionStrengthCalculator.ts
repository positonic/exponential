import { db } from "~/server/db";

export interface ScoreBreakdown {
  totalScore: number;
  recency: number;
  frequency: number;
  interactionType: number;
  duration: number;
  details: {
    mostRecentInteraction?: Date;
    daysSinceLastInteraction?: number;
    interactionsLast90Days: number;
    meetingCount: number;
    emailCount: number;
    totalInteractions: number;
  };
}

export class ConnectionStrengthCalculator {
  /**
   * Calculate total connection strength score (0-100)
   */
  static async calculateScore(contactId: string): Promise<number> {
    const breakdown = await this.getScoreBreakdown(contactId);
    return breakdown.totalScore;
  }

  /**
   * Get detailed score breakdown with all components
   */
  static async getScoreBreakdown(contactId: string): Promise<ScoreBreakdown> {
    // Fetch all interactions for this contact
    const interactions = await db.crmContactInteraction.findMany({
      where: { contactId },
      orderBy: { occurredAt: "desc" },
    });

    if (interactions.length === 0) {
      return {
        totalScore: 0,
        recency: 0,
        frequency: 0,
        interactionType: 0,
        duration: 0,
        details: {
          interactionsLast90Days: 0,
          meetingCount: 0,
          emailCount: 0,
          totalInteractions: 0,
        },
      };
    }

    // Calculate each component
    const recencyScore = this.calculateRecencyScore(interactions);
    const frequencyScore = this.calculateFrequencyScore(interactions);
    const typeScore = this.calculateInteractionTypeScore(interactions);
    const durationScore = this.calculateDurationScore(
      interactions.map((i) => ({
        type: i.type,
        occurredAt: i.occurredAt,
        metadata:
          i.metadata && typeof i.metadata === "object" && !Array.isArray(i.metadata)
            ? (i.metadata as Record<string, unknown>)
            : null,
      }))
    );

    // Calculate total (max 100)
    const totalScore = Math.min(
      100,
      recencyScore + frequencyScore + typeScore + durationScore
    );

    // Gather details
    const mostRecent = interactions[0]!;
    const daysSince = Math.floor(
      (Date.now() - mostRecent.occurredAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentInteractions = interactions.filter(
      (i) => i.occurredAt >= last90Days
    );

    const meetingCount = interactions.filter((i) => i.type === "MEETING").length;
    const emailCount = interactions.filter((i) => i.type === "EMAIL").length;

    return {
      totalScore: Math.round(totalScore),
      recency: recencyScore,
      frequency: frequencyScore,
      interactionType: typeScore,
      duration: durationScore,
      details: {
        mostRecentInteraction: mostRecent.occurredAt,
        daysSinceLastInteraction: daysSince,
        interactionsLast90Days: recentInteractions.length,
        meetingCount,
        emailCount,
        totalInteractions: interactions.length,
      },
    };
  }

  /**
   * Calculate recency score (0-40 points)
   * Recent interactions are heavily weighted
   */
  private static calculateRecencyScore(
    interactions: Array<{ occurredAt: Date }>
  ): number {
    if (interactions.length === 0) return 0;

    // Get most recent interaction
    const mostRecent = interactions.reduce((latest, curr) =>
      curr.occurredAt > latest.occurredAt ? curr : latest
    );

    const daysSince = Math.floor(
      (Date.now() - mostRecent.occurredAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Score based on recency buckets
    if (daysSince <= 7) return 40; // Hot connection
    if (daysSince <= 30) return 30; // Active
    if (daysSince <= 90) return 20; // Moderate
    if (daysSince <= 180) return 10; // Cooling
    return 5; // Cold
  }

  /**
   * Calculate frequency score (0-30 points)
   * Based on interactions in last 90 days
   */
  private static calculateFrequencyScore(
    interactions: Array<{ occurredAt: Date }>
  ): number {
    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentInteractions = interactions.filter(
      (i) => i.occurredAt >= last90Days
    );

    const count = recentInteractions.length;

    // Score based on frequency buckets
    if (count >= 10) return 30; // Very frequent
    if (count >= 5) return 20; // Frequent
    if (count >= 3) return 15; // Regular
    if (count >= 2) return 10; // Occasional
    if (count >= 1) return 5; // Rare
    return 0;
  }

  /**
   * Calculate interaction type score (0-20 points)
   * Meetings > Emails > Other
   */
  private static calculateInteractionTypeScore(
    interactions: Array<{ type: string; direction: string; occurredAt: Date }>
  ): number {
    let score = 0;

    // Count each interaction type in last 90 days
    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentInteractions = interactions.filter(
      (i) => i.occurredAt >= last90Days
    );

    const meetings = recentInteractions.filter((i) => i.type === "MEETING");
    const emails = recentInteractions.filter((i) => i.type === "EMAIL");

    // Meetings: 10 points each (max 20)
    score += Math.min(20, meetings.length * 10);

    // If no meetings, score emails
    if (score < 20) {
      const bidirectionalEmails = emails.filter(
        (i) => i.direction === "BIDIRECTIONAL"
      );
      const oneWayEmails = emails.filter(
        (i) => i.direction !== "BIDIRECTIONAL"
      );

      // Bidirectional emails: 5 points each (max 15 total for emails)
      const emailScore = Math.min(
        15,
        bidirectionalEmails.length * 5 + oneWayEmails.length * 2
      );
      score = Math.min(20, score + emailScore);
    }

    return score;
  }

  /**
   * Calculate duration score (0-10 points)
   * Only applies to meetings with duration metadata
   */
  private static calculateDurationScore(
    interactions: Array<{
      type: string;
      occurredAt: Date;
      metadata?: Record<string, unknown> | null;
    }>
  ): number {
    // Get meetings with duration in last 90 days
    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const meetings = interactions.filter(
      (i) =>
        i.type === "MEETING" &&
        i.occurredAt >= last90Days &&
        i.metadata &&
        typeof i.metadata === "object" &&
        "duration" in i.metadata &&
        typeof i.metadata.duration === "number"
    );

    if (meetings.length === 0) return 0;

    // Find longest meeting
    const longestMeeting = meetings.reduce(
      (longest, curr) => {
        const currDuration =
          curr.metadata && typeof curr.metadata === "object" && "duration" in curr.metadata
            ? (curr.metadata.duration as number)
            : 0;
        const longestDuration =
          longest.metadata && typeof longest.metadata === "object" && "duration" in longest.metadata
            ? (longest.metadata.duration as number)
            : 0;
        return currDuration > longestDuration ? curr : longest;
      },
      meetings[0]!
    );

    const duration =
      longestMeeting.metadata &&
      typeof longestMeeting.metadata === "object" &&
      "duration" in longestMeeting.metadata
        ? (longestMeeting.metadata.duration as number)
        : 0;

    // Score based on duration buckets
    if (duration >= 60) return 10; // 60+ minutes
    if (duration >= 30) return 7; // 30-59 minutes
    if (duration >= 15) return 5; // 15-29 minutes
    if (duration > 0) return 3; // <15 minutes
    return 0;
  }

  /**
   * Recalculate scores for all contacts in a workspace
   */
  static async recalculateAllScores(workspaceId: string): Promise<void> {
    const contacts = await db.crmContact.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    console.log(`Recalculating scores for ${contacts.length} contacts...`);

    let successCount = 0;
    let errorCount = 0;

    for (const contact of contacts) {
      try {
        const score = await this.calculateScore(contact.id);
        await db.crmContact.update({
          where: { id: contact.id },
          data: { connectionScore: score },
        });
        successCount++;
      } catch (error) {
        console.error(
          `Error recalculating score for contact ${contact.id}:`,
          error
        );
        errorCount++;
      }
    }

    console.log(
      `✅ Score recalculation complete: ${successCount} success, ${errorCount} errors`
    );
  }

  /**
   * Get score color for UI display
   */
  static getScoreColor(score: number): string {
    if (score >= 81) return "green"; // Strong
    if (score >= 61) return "lime"; // Good
    if (score >= 41) return "yellow"; // Moderate
    if (score >= 21) return "orange"; // Weak
    return "red"; // Very weak
  }

  /**
   * Get score label
   */
  static getScoreLabel(score: number): string {
    if (score >= 81) return "Strong Connection";
    if (score >= 61) return "Good Connection";
    if (score >= 41) return "Moderate Connection";
    if (score >= 21) return "Weak Connection";
    return "Very Weak Connection";
  }
}
