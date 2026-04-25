import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import * as wheelOfLifeService from "~/server/services/wheelOfLifeService";

const assessmentModeEnum = z.enum(["quick", "deep"]);
const assessmentTypeEnum = z.enum(["on_demand", "quarterly"]);
const priorityEnum = z.enum(["high", "medium", "low"]);

export const wheelOfLifeRouter = createTRPCRouter({
  // Get all active life domains for the wheel of life
  getLifeDomains: protectedProcedure.query(({ ctx }) => {
    return wheelOfLifeService.getActiveLifeDomains({ ctx });
  }),

  // Create a new assessment
  createAssessment: protectedProcedure
    .input(
      z.object({
        mode: assessmentModeEnum,
        type: assessmentTypeEnum.optional().default("on_demand"),
        quarterYear: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return wheelOfLifeService.createAssessment({
        ctx,
        mode: input.mode,
        type: input.type,
        quarterYear: input.quarterYear,
      });
    }),

  // Save a single score
  saveScore: protectedProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        lifeDomainId: z.number(),
        currentRank: z.number().min(1).max(10),
        desiredRank: z.number().min(1).max(10),
        score: z.number().min(1).max(10).optional(),
        reflection: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return wheelOfLifeService.saveScore({
        ctx,
        ...input,
      });
    }),

  // Save all scores at once
  saveAllScores: protectedProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        scores: z.array(
          z.object({
            lifeDomainId: z.number(),
            currentRank: z.number().min(1).max(10),
            desiredRank: z.number().min(1).max(10),
            score: z.number().min(1).max(10).optional(),
            reflection: z.string().optional(),
          })
        ),
      })
    )
    .mutation(({ ctx, input }) => {
      return wheelOfLifeService.saveAllScores({
        ctx,
        assessmentId: input.assessmentId,
        scores: input.scores,
      });
    }),

  // Complete an assessment
  completeAssessment: protectedProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return wheelOfLifeService.completeAssessment({
        ctx,
        assessmentId: input.assessmentId,
        notes: input.notes,
      });
    }),

  // Get the latest assessment
  getLatestAssessment: protectedProcedure.query(({ ctx }) => {
    return wheelOfLifeService.getLatestAssessment({ ctx });
  }),

  // Get a specific assessment by ID
  getAssessment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return wheelOfLifeService.getAssessment({ ctx, id: input.id });
    }),

  // Get assessment history
  getAssessmentHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().optional().default(10),
        })
        .optional()
    )
    .query(({ ctx, input }) => {
      return wheelOfLifeService.getAssessmentHistory({
        ctx,
        limit: input?.limit,
      });
    }),

  // Check if quarterly assessment is due
  checkQuarterlyDue: protectedProcedure.query(({ ctx }) => {
    return wheelOfLifeService.checkQuarterlyDue({ ctx });
  }),

  // Save a recommendation
  saveRecommendation: protectedProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        lifeDomainId: z.number(),
        recommendation: z.string(),
        suggestedGoal: z.string().optional(),
        priority: priorityEnum.optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return wheelOfLifeService.saveRecommendation({
        ctx,
        ...input,
      });
    }),

  // Get recommendations for an assessment
  getRecommendations: protectedProcedure
    .input(z.object({ assessmentId: z.string() }))
    .query(({ ctx, input }) => {
      return wheelOfLifeService.getRecommendations({
        ctx,
        assessmentId: input.assessmentId,
      });
    }),

  // Create a goal from a recommendation
  createGoalFromRecommendation: protectedProcedure
    .input(
      z.object({
        recommendationId: z.string(),
        title: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return wheelOfLifeService.createGoalFromRecommendation({
        ctx,
        ...input,
      });
    }),
});
