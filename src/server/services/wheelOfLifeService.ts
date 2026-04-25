import type { Context } from "~/server/auth/types";
import type { Prisma } from "@prisma/client";

interface ServiceContext {
  ctx: Context;
}

// Get all active life domains for the wheel of life
export async function getActiveLifeDomains({ ctx }: ServiceContext) {
  return ctx.db.lifeDomain.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

// Create a new assessment
export async function createAssessment({
  ctx,
  mode,
  type,
  quarterYear,
}: ServiceContext & {
  mode: "quick" | "deep";
  type: "on_demand" | "quarterly";
  quarterYear?: string;
}) {
  return ctx.db.wheelOfLifeAssessment.create({
    data: {
      userId: ctx.session!.user.id,
      mode,
      type,
      quarterYear,
    },
    include: {
      scores: true,
    },
  });
}

// Save a score for a category
export async function saveScore({
  ctx,
  assessmentId,
  lifeDomainId,
  currentRank,
  desiredRank,
  score,
  reflection,
}: ServiceContext & {
  assessmentId: string;
  lifeDomainId: number;
  currentRank: number;
  desiredRank: number;
  score?: number;
  reflection?: string;
}) {
  // Verify the assessment belongs to the user
  const assessment = await ctx.db.wheelOfLifeAssessment.findFirst({
    where: {
      id: assessmentId,
      userId: ctx.session!.user.id,
    },
  });

  if (!assessment) {
    throw new Error("Assessment not found or access denied");
  }

  return ctx.db.wheelOfLifeScore.upsert({
    where: {
      assessmentId_lifeDomainId: {
        assessmentId,
        lifeDomainId,
      },
    },
    update: {
      currentRank,
      desiredRank,
      score,
      reflection,
    },
    create: {
      assessmentId,
      lifeDomainId,
      currentRank,
      desiredRank,
      score,
      reflection,
    },
  });
}

// Save all scores at once (batch operation)
export async function saveAllScores({
  ctx,
  assessmentId,
  scores,
}: ServiceContext & {
  assessmentId: string;
  scores: Array<{
    lifeDomainId: number;
    currentRank: number;
    desiredRank: number;
    score?: number;
    reflection?: string;
  }>;
}) {
  // Verify the assessment belongs to the user
  const assessment = await ctx.db.wheelOfLifeAssessment.findFirst({
    where: {
      id: assessmentId,
      userId: ctx.session!.user.id,
    },
  });

  if (!assessment) {
    throw new Error("Assessment not found or access denied");
  }

  // Delete existing scores and create new ones in a transaction
  return ctx.db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.wheelOfLifeScore.deleteMany({
      where: { assessmentId },
    });

    return tx.wheelOfLifeScore.createMany({
      data: scores.map((s) => ({
        assessmentId,
        lifeDomainId: s.lifeDomainId,
        currentRank: s.currentRank,
        desiredRank: s.desiredRank,
        score: s.score,
        reflection: s.reflection,
      })),
    });
  });
}

// Complete an assessment
export async function completeAssessment({
  ctx,
  assessmentId,
  notes,
}: ServiceContext & {
  assessmentId: string;
  notes?: string;
}) {
  // Verify the assessment belongs to the user
  const assessment = await ctx.db.wheelOfLifeAssessment.findFirst({
    where: {
      id: assessmentId,
      userId: ctx.session!.user.id,
    },
    include: {
      scores: {
        include: {
          lifeDomain: true,
        },
      },
    },
  });

  if (!assessment) {
    throw new Error("Assessment not found or access denied");
  }

  // Update the assessment with notes and mark as completed
  return ctx.db.wheelOfLifeAssessment.update({
    where: { id: assessmentId },
    data: {
      notes,
      completedAt: new Date(),
    },
    include: {
      scores: {
        include: {
          lifeDomain: true,
        },
      },
    },
  });
}

// Get the latest assessment for the current user
export async function getLatestAssessment({ ctx }: ServiceContext) {
  return ctx.db.wheelOfLifeAssessment.findFirst({
    where: {
      userId: ctx.session!.user.id,
    },
    orderBy: {
      completedAt: "desc",
    },
    include: {
      scores: {
        include: {
          lifeDomain: true,
        },
      },
      recommendations: true,
    },
  });
}

// Get a specific assessment by ID
export async function getAssessment({
  ctx,
  id,
}: ServiceContext & { id: string }) {
  return ctx.db.wheelOfLifeAssessment.findFirst({
    where: {
      id,
      userId: ctx.session!.user.id,
    },
    include: {
      scores: {
        include: {
          lifeDomain: true,
        },
      },
      recommendations: true,
    },
  });
}

// Get assessment history
export async function getAssessmentHistory({
  ctx,
  limit = 10,
}: ServiceContext & { limit?: number }) {
  return ctx.db.wheelOfLifeAssessment.findMany({
    where: {
      userId: ctx.session!.user.id,
    },
    orderBy: {
      completedAt: "desc",
    },
    take: limit,
    include: {
      scores: {
        include: {
          lifeDomain: true,
        },
      },
    },
  });
}

// Check if a quarterly assessment is due
export async function checkQuarterlyDue({ ctx }: ServiceContext) {
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const currentQuarterYear = `${now.getFullYear()}-Q${currentQuarter}`;

  const existingQuarterlyAssessment =
    await ctx.db.wheelOfLifeAssessment.findFirst({
      where: {
        userId: ctx.session!.user.id,
        type: "quarterly",
        quarterYear: currentQuarterYear,
      },
    });

  return {
    isDue: !existingQuarterlyAssessment,
    currentQuarter: currentQuarterYear,
    lastAssessment: existingQuarterlyAssessment,
  };
}

// Save a recommendation from AI
export async function saveRecommendation({
  ctx,
  assessmentId,
  lifeDomainId,
  recommendation,
  suggestedGoal,
  priority,
}: ServiceContext & {
  assessmentId: string;
  lifeDomainId: number;
  recommendation: string;
  suggestedGoal?: string;
  priority?: "high" | "medium" | "low";
}) {
  return ctx.db.wheelOfLifeRecommendation.create({
    data: {
      assessmentId,
      lifeDomainId,
      recommendation,
      suggestedGoal,
      priority: priority ?? "medium",
    },
  });
}

// Get recommendations for an assessment
export async function getRecommendations({
  ctx,
  assessmentId,
}: ServiceContext & { assessmentId: string }) {
  return ctx.db.wheelOfLifeRecommendation.findMany({
    where: {
      assessmentId,
      assessment: {
        userId: ctx.session!.user.id,
      },
    },
    orderBy: {
      priority: "asc", // high, low, medium alphabetically - may need custom ordering
    },
  });
}

// Create a goal from a recommendation
export async function createGoalFromRecommendation({
  ctx,
  recommendationId,
  title,
  description,
}: ServiceContext & {
  recommendationId: string;
  title: string;
  description?: string;
}) {
  // Get the recommendation
  const recommendation = await ctx.db.wheelOfLifeRecommendation.findFirst({
    where: {
      id: recommendationId,
      assessment: {
        userId: ctx.session!.user.id,
      },
    },
  });

  if (!recommendation) {
    throw new Error("Recommendation not found or access denied");
  }

  // Create the goal
  const goal = await ctx.db.goal.create({
    data: {
      title,
      description,
      lifeDomainId: recommendation.lifeDomainId,
      userId: ctx.session!.user.id,
    },
  });

  // Mark the recommendation as having a goal created
  await ctx.db.wheelOfLifeRecommendation.update({
    where: { id: recommendationId },
    data: {
      goalCreated: true,
      goalId: goal.id,
    },
  });

  return goal;
}

// Calculate priority gaps for an assessment
export function calculatePriorityGaps(
  scores: Array<{
    lifeDomainId: number;
    currentRank: number;
    desiredRank: number;
    score?: number | null;
    lifeDomain: { title: string };
  }>
) {
  return scores
    .map((s) => ({
      lifeDomainId: s.lifeDomainId,
      title: s.lifeDomain.title,
      currentRank: s.currentRank,
      desiredRank: s.desiredRank,
      gap: s.currentRank - s.desiredRank, // Positive = underinvesting, Negative = overinvesting
      score: s.score,
      needsAttention: s.currentRank - s.desiredRank > 0 || (s.score !== null && s.score !== undefined && s.score <= 5),
    }))
    .sort((a, b) => b.gap - a.gap); // Sort by largest gap first
}
