import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Zod schemas for validation
const UsageTypeSchema = z.enum(["work", "personal"]);
const OnboardingStepSchema = z.number().int().min(1).max(4);

export const onboardingRouter = createTRPCRouter({
  /**
   * Get current onboarding status and step for the user
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        usageType: true,
        userRole: true,
        selectedTools: true,
        onboardingCompletedAt: true,
        onboardingStep: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return {
      usageType: user.usageType,
      userRole: user.userRole,
      selectedTools: user.selectedTools,
      onboardingCompletedAt: user.onboardingCompletedAt,
      onboardingStep: user.onboardingStep,
      isCompleted: !!user.onboardingCompletedAt,
    };
  }),

  /**
   * Update user's usage type (work/personal) and advance to step 2
   */
  updateUsageType: protectedProcedure
    .input(
      z.object({
        usageType: UsageTypeSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { usageType } = input;
      const userId = ctx.session.user.id;

      // Determine next step - skip role if personal, go to step 3
      const nextStep = usageType === "work" ? 2 : 3;

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          usageType,
          onboardingStep: nextStep,
        },
        select: {
          usageType: true,
          onboardingStep: true,
        },
      });

      return {
        success: true,
        usageType: updatedUser.usageType,
        nextStep: updatedUser.onboardingStep,
      };
    }),

  /**
   * Update user's role (only for work usage type) and advance to step 3
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        userRole: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userRole } = input;
      const userId = ctx.session.user.id;

      // Verify user is on the correct step and has work usage type
      const currentUser = await ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          usageType: true,
          onboardingStep: true,
        },
      });

      if (!currentUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (currentUser.usageType !== "work") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Role selection is only available for work usage type",
        });
      }

      if (currentUser.onboardingStep !== 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must complete usage type selection first",
        });
      }

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          userRole,
          onboardingStep: 3,
        },
        select: {
          userRole: true,
          onboardingStep: true,
        },
      });

      return {
        success: true,
        userRole: updatedUser.userRole,
        nextStep: updatedUser.onboardingStep,
      };
    }),

  /**
   * Update user's selected tools and advance to step 4
   */
  updateTools: protectedProcedure
    .input(
      z.object({
        selectedTools: z.array(z.string()).max(20), // Allow up to 20 tools
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { selectedTools } = input;
      const userId = ctx.session.user.id;

      // Verify user is on the correct step
      const currentUser = await ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          onboardingStep: true,
        },
      });

      if (!currentUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (currentUser.onboardingStep !== 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must complete previous onboarding steps first",
        });
      }

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          selectedTools,
          onboardingStep: 4,
        },
        select: {
          selectedTools: true,
          onboardingStep: true,
        },
      });

      return {
        success: true,
        selectedTools: updatedUser.selectedTools,
        nextStep: updatedUser.onboardingStep,
      };
    }),

  /**
   * Complete onboarding by creating first project and marking as completed
   */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        projectName: z.string().min(1).max(100),
        projectDescription: z.string().max(500).optional(),
        projectPriority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
        template: z.enum(["personal", "work", "learning", "scratch"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectName, projectDescription, projectPriority, template } = input;
      const userId = ctx.session.user.id;

      // Verify user is on the final step
      const currentUser = await ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          onboardingStep: true,
          onboardingCompletedAt: true,
        },
      });

      if (!currentUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (currentUser.onboardingStep !== 4) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must complete previous onboarding steps first",
        });
      }

      if (currentUser.onboardingCompletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Onboarding already completed",
        });
      }

      // Use a transaction to create project and complete onboarding atomically
      const result = await ctx.db.$transaction(async (tx) => {
        // Create the first project
        const project = await tx.project.create({
          data: {
            name: projectName,
            description: projectDescription || `My first project - created during onboarding${template ? ` using ${template} template` : ""}`,
            priority: projectPriority,
            status: "ACTIVE",
            createdById: userId,
            slug: projectName.toLowerCase().split(" ").join("-")
          },
        });

        // Mark onboarding as completed
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            onboardingCompletedAt: new Date(),
            // Keep onboardingStep at 4 for potential future reference
          },
          select: {
            onboardingCompletedAt: true,
            usageType: true,
            userRole: true,
            selectedTools: true,
          },
        });

        return {
          project,
          user: updatedUser,
        };
      });

      return {
        success: true,
        project: {
          id: result.project.id,
          name: result.project.name,
          description: result.project.description,
        },
        completedAt: result.user.onboardingCompletedAt,
        userData: {
          usageType: result.user.usageType,
          userRole: result.user.userRole,
          selectedTools: result.user.selectedTools,
        },
      };
    }),
});