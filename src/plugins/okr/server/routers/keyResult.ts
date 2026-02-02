import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Input validation schemas
const createKeyResultInput = z.object({
  goalId: z.number(),
  title: z.string().min(1),
  description: z.string().optional(),
  targetValue: z.number(),
  startValue: z.number().default(0),
  currentValue: z.number().default(0),
  unit: z
    .enum(["percent", "count", "currency", "hours", "custom"])
    .default("percent"),
  unitLabel: z.string().optional(),
  period: z.string(), // e.g., "Q1-2025"
  periodStart: z.date().optional(),
  periodEnd: z.date().optional(),
  workspaceId: z.string().optional(),
});

const updateKeyResultInput = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  startValue: z.number().optional(),
  unit: z.enum(["percent", "count", "currency", "hours", "custom"]).optional(),
  unitLabel: z.string().optional(),
  status: z
    .enum(["on-track", "at-risk", "off-track", "achieved"])
    .optional(),
  confidence: z.number().min(0).max(100).optional(),
});

const checkInInput = z.object({
  keyResultId: z.string(),
  newValue: z.number(),
  notes: z.string().optional(),
});

/**
 * Get the parent annual period for a quarterly or half-year period.
 * @example getParentPeriodFromString("Q1-2026") => "Annual-2026"
 */
function getParentPeriodFromString(period: string): string | null {
  const match = period.match(/^(Q[1-4]|H[12])-(\d{4})$/);
  if (!match) return null;
  return `Annual-${match[2]}`;
}

/**
 * Calculate the end date for a period string.
 * Supports formats: Q1-2025, H1-2025, Annual-2025
 */
function getPeriodEndDate(period: string): Date | null {
  const match = period.match(/^(Q[1-4]|H[12]|Annual)-(\d{4})$/);
  if (!match) return null;

  const [, type, yearStr] = match;
  const year = parseInt(yearStr ?? "0", 10);

  switch (type) {
    case "Q1":
      return new Date(year, 2, 31); // March 31
    case "Q2":
      return new Date(year, 5, 30); // June 30
    case "Q3":
      return new Date(year, 8, 30); // Sept 30
    case "Q4":
      return new Date(year, 11, 31); // Dec 31
    case "H1":
      return new Date(year, 5, 30); // June 30
    case "H2":
      return new Date(year, 11, 31); // Dec 31
    case "Annual":
      return new Date(year, 11, 31); // Dec 31
    default:
      return null;
  }
}

export const keyResultRouter = createTRPCRouter({
  // Get all key results for a workspace/user
  getAll: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
          goalId: z.number().optional(),
          period: z.string().optional(),
          status: z
            .enum(["on-track", "at-risk", "off-track", "achieved"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.keyResult.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input?.goalId ? { goalId: input.goalId } : {}),
          ...(input?.period ? { period: input.period } : {}),
          ...(input?.status ? { status: input.status } : {}),
        },
        include: {
          goal: {
            include: {
              lifeDomain: true,
            },
          },
          checkIns: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: [{ goal: { title: "asc" } }, { createdAt: "desc" }],
      });
    }),

  // Get key results grouped by objective (goal)
  getByObjective: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        period: z.string().optional(),
        includePairedPeriod: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build period filter - optionally include parent annual period
      let periodFilter: { period: string } | { period: { in: string[] } } | undefined;
      if (input.period) {
        if (input.includePairedPeriod) {
          // Include both the selected period and its parent annual period
          const parentPeriod = getParentPeriodFromString(input.period);
          const periods = parentPeriod
            ? [input.period, parentPeriod]
            : [input.period];
          periodFilter = { period: { in: periods } };
        } else {
          periodFilter = { period: input.period };
        }
      }

      // Build goal period filter to match goals by their period field
      // Include goals that match the period OR have no period set (legacy goals)
      let goalPeriodFilter: { OR: Array<{ period: string | null } | { period: { in: string[] } }> } | undefined;
      if (input.period) {
        if (input.includePairedPeriod) {
          const parentPeriod = getParentPeriodFromString(input.period);
          const periods = parentPeriod
            ? [input.period, parentPeriod]
            : [input.period];
          goalPeriodFilter = {
            OR: [
              { period: { in: periods } },
              { period: null }, // Include legacy goals without period
            ],
          };
        } else {
          goalPeriodFilter = {
            OR: [
              { period: input.period },
              { period: null }, // Include legacy goals without period
            ],
          };
        }
      }

      // Show goals matching the selected period (by goal.period) or with no period set
      // Goals without key results in the period will still show so users can add KRs
      const goals = await ctx.db.goal.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...goalPeriodFilter,
        },
        include: {
          lifeDomain: true,
          keyResults: {
            where: {
              ...periodFilter,
              // Only show KeyResults owned by the current user
              userId: ctx.session.user.id,
            },
            include: {
              checkIns: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
              user: {
                select: { id: true, name: true, email: true, image: true },
              },
              projects: {
                include: {
                  project: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { title: "asc" },
      });

      // Calculate progress for each objective
      return goals.map((goal) => {
        const keyResults = goal.keyResults;
        const avgProgress =
          keyResults.length > 0
            ? keyResults.reduce((acc, kr) => {
                const range = kr.targetValue - kr.startValue;
                const progress =
                  range > 0
                    ? ((kr.currentValue - kr.startValue) / range) * 100
                    : 0;
                return acc + Math.min(100, Math.max(0, progress));
              }, 0) / keyResults.length
            : 0;

        const statusCounts = {
          "on-track": keyResults.filter((kr) => kr.status === "on-track")
            .length,
          "at-risk": keyResults.filter((kr) => kr.status === "at-risk").length,
          "off-track": keyResults.filter((kr) => kr.status === "off-track")
            .length,
          achieved: keyResults.filter((kr) => kr.status === "achieved").length,
        };

        return {
          ...goal,
          progress: Math.round(avgProgress),
          statusCounts,
        };
      });
    }),

  // Get a single key result
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const keyResult = await ctx.db.keyResult.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        include: {
          goal: {
            include: {
              lifeDomain: true,
            },
          },
          checkIns: {
            orderBy: { createdAt: "desc" },
            include: {
              createdBy: {
                select: { id: true, name: true, image: true },
              },
            },
          },
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      return keyResult;
    }),

  // Create a new key result
  create: protectedProcedure
    .input(createKeyResultInput)
    .mutation(async ({ ctx, input }) => {
      // Verify goal belongs to user
      const goal = await ctx.db.goal.findFirst({
        where: {
          id: input.goalId,
          userId: ctx.session.user.id,
        },
      });

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found or access denied",
        });
      }

      return ctx.db.keyResult.create({
        data: {
          ...input,
          userId: ctx.session.user.id,
        },
        include: {
          goal: true,
        },
      });
    }),

  // Update a key result
  update: protectedProcedure
    .input(updateKeyResultInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify ownership
      const existing = await ctx.db.keyResult.findFirst({
        where: { id, userId: ctx.session.user.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      return ctx.db.keyResult.update({
        where: { id },
        data: updateData,
        include: {
          goal: true,
        },
      });
    }),

  // Record a check-in (progress update)
  checkIn: protectedProcedure
    .input(checkInInput)
    .mutation(async ({ ctx, input }) => {
      const keyResult = await ctx.db.keyResult.findFirst({
        where: {
          id: input.keyResultId,
          userId: ctx.session.user.id,
        },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Determine new status based on progress
      const range = keyResult.targetValue - keyResult.startValue;
      const progress =
        range > 0
          ? ((input.newValue - keyResult.startValue) / range) * 100
          : 0;

      let newStatus = keyResult.status;
      if (progress >= 100) {
        newStatus = "achieved";
      } else if (progress >= 70) {
        newStatus = "on-track";
      } else if (progress >= 40) {
        newStatus = "at-risk";
      } else {
        newStatus = "off-track";
      }

      // Create check-in and update key result in transaction
      const [checkIn] = await ctx.db.$transaction([
        ctx.db.keyResultCheckIn.create({
          data: {
            keyResultId: input.keyResultId,
            previousValue: keyResult.currentValue,
            newValue: input.newValue,
            notes: input.notes,
            createdById: ctx.session.user.id,
          },
        }),
        ctx.db.keyResult.update({
          where: { id: input.keyResultId },
          data: {
            currentValue: input.newValue,
            status: newStatus,
          },
        }),
      ]);

      return checkIn;
    }),

  // Delete a key result
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.keyResult.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      await ctx.db.keyResult.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Update linked projects (batch operation for modal save)
  updateLinkedProjects: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        projectIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: {
          id: input.keyResultId,
          userId: ctx.session.user.id,
        },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Use transaction to ensure atomicity
      await ctx.db.$transaction(async (tx) => {
        // Delete all existing project links
        await tx.keyResultProject.deleteMany({
          where: { keyResultId: input.keyResultId },
        });

        // Create new project links
        if (input.projectIds.length > 0) {
          await tx.keyResultProject.createMany({
            data: input.projectIds.map((projectId) => ({
              keyResultId: input.keyResultId,
              projectId,
            })),
          });
        }
      });

      // Return updated key result with projects
      return ctx.db.keyResult.findUnique({
        where: { id: input.keyResultId },
        include: {
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      });
    }),

  // Link a single project to a key result
  linkProject: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: {
          id: input.keyResultId,
          userId: ctx.session.user.id,
        },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Create the link (will be ignored if already exists due to unique constraint)
      await ctx.db.keyResultProject.upsert({
        where: {
          keyResultId_projectId: {
            keyResultId: input.keyResultId,
            projectId: input.projectId,
          },
        },
        create: {
          keyResultId: input.keyResultId,
          projectId: input.projectId,
        },
        update: {}, // No-op if already exists
      });

      return { success: true };
    }),

  // Unlink a single project from a key result
  unlinkProject: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: {
          id: input.keyResultId,
          userId: ctx.session.user.id,
        },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      // Delete the link
      await ctx.db.keyResultProject.deleteMany({
        where: {
          keyResultId: input.keyResultId,
          projectId: input.projectId,
        },
      });

      return { success: true };
    }),

  // Get available periods (quarters)
  getPeriods: protectedProcedure.query(() => {
    const currentYear = new Date().getFullYear();
    const periods = [];

    // Generate quarters for current and next year
    for (const year of [currentYear, currentYear + 1]) {
      periods.push(
        { value: `Q1-${year}`, label: `Q1 ${year} (Jan-Mar)` },
        { value: `Q2-${year}`, label: `Q2 ${year} (Apr-Jun)` },
        { value: `Q3-${year}`, label: `Q3 ${year} (Jul-Sep)` },
        { value: `Q4-${year}`, label: `Q4 ${year} (Oct-Dec)` },
        { value: `H1-${year}`, label: `H1 ${year} (Jan-Jun)` },
        { value: `H2-${year}`, label: `H2 ${year} (Jul-Dec)` },
        { value: `Annual-${year}`, label: `Annual ${year}` }
      );
    }

    return periods;
  }),

  // Get OKR statistics for dashboard
  getStats: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        period: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = {
        userId: ctx.session.user.id,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.period ? { period: input.period } : {}),
      };

      const [totalKeyResults, onTrack, atRisk, offTrack, achieved, objectives] =
        await Promise.all([
          ctx.db.keyResult.count({ where }),
          ctx.db.keyResult.count({ where: { ...where, status: "on-track" } }),
          ctx.db.keyResult.count({ where: { ...where, status: "at-risk" } }),
          ctx.db.keyResult.count({ where: { ...where, status: "off-track" } }),
          ctx.db.keyResult.count({ where: { ...where, status: "achieved" } }),
          ctx.db.goal.count({
            where: {
              userId: ctx.session.user.id,
              ...(input.workspaceId
                ? { workspaceId: input.workspaceId }
                : {}),
            },
          }),
        ]);

      // Calculate average progress and confidence
      const keyResults = await ctx.db.keyResult.findMany({
        where,
        select: {
          currentValue: true,
          startValue: true,
          targetValue: true,
          confidence: true,
        },
      });

      const avgProgress =
        keyResults.length > 0
          ? keyResults.reduce((acc, kr) => {
              const range = kr.targetValue - kr.startValue;
              const progress =
                range > 0
                  ? ((kr.currentValue - kr.startValue) / range) * 100
                  : 0;
              return acc + Math.min(100, Math.max(0, progress));
            }, 0) / keyResults.length
          : 0;

      // Calculate average confidence from KRs that have it set
      const krsWithConfidence = keyResults.filter((kr) => kr.confidence !== null);
      const avgConfidence =
        krsWithConfidence.length > 0
          ? krsWithConfidence.reduce((acc, kr) => acc + (kr.confidence ?? 0), 0) /
            krsWithConfidence.length
          : null;

      // Calculate period end date for "days left" display
      const periodEndDate = input.period
        ? getPeriodEndDate(input.period)
        : null;

      return {
        totalObjectives: objectives,
        totalKeyResults,
        completedKeyResults: achieved,
        statusBreakdown: { onTrack, atRisk, offTrack, achieved },
        averageProgress: Math.round(avgProgress),
        averageConfidence:
          avgConfidence !== null ? Math.round(avgConfidence) : null,
        periodEndDate,
      };
    }),

  // Get goals that can be used as objectives (for selection in forms)
  getAvailableGoals: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.goal.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          lifeDomain: true,
        },
        orderBy: { title: "asc" },
      });
    }),

  // ============================================
  // OKR Discussion Comments
  // ============================================

  // Add comment to an objective (goal)
  addGoalComment: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns this goal
      const goal = await ctx.db.goal.findFirst({
        where: { id: input.goalId, userId: ctx.session.user.id },
      });

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Objective not found",
        });
      }

      const comment = await ctx.db.goalComment.create({
        data: {
          goalId: input.goalId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return comment;
    }),

  // Get comments for an objective (goal)
  getGoalComments: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user owns this goal
      const goal = await ctx.db.goal.findFirst({
        where: { id: input.goalId, userId: ctx.session.user.id },
      });

      if (!goal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Objective not found",
        });
      }

      return ctx.db.goalComment.findMany({
        where: { goalId: input.goalId },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  // Delete own comment from an objective
  deleteGoalComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.goalComment.findFirst({
        where: { id: input.commentId, authorId: ctx.session.user.id },
      });

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or you don't have permission to delete it",
        });
      }

      await ctx.db.goalComment.delete({ where: { id: input.commentId } });
      return { success: true };
    }),

  // Add comment to a key result
  addKeyResultComment: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns this key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId, userId: ctx.session.user.id },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      const comment = await ctx.db.keyResultComment.create({
        data: {
          keyResultId: input.keyResultId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return comment;
    }),

  // Get comments for a key result
  getKeyResultComments: protectedProcedure
    .input(
      z.object({
        keyResultId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user owns this key result
      const keyResult = await ctx.db.keyResult.findFirst({
        where: { id: input.keyResultId, userId: ctx.session.user.id },
      });

      if (!keyResult) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Key result not found",
        });
      }

      return ctx.db.keyResultComment.findMany({
        where: { keyResultId: input.keyResultId },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  // Delete own comment from a key result
  deleteKeyResultComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.keyResultComment.findFirst({
        where: { id: input.commentId, authorId: ctx.session.user.id },
      });

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or you don't have permission to delete it",
        });
      }

      await ctx.db.keyResultComment.delete({ where: { id: input.commentId } });
      return { success: true };
    }),
});
