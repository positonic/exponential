import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { uploadToBlob } from "~/lib/blob";

export const onboardingRouter = createTRPCRouter({
  /**
   * Get current onboarding status and step for the user
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        name: true,
        email: true,
        image: true,
        emailMarketingOptIn: true,
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
      name: user.name,
      email: user.email,
      image: user.image,
      emailMarketingOptIn: user.emailMarketingOptIn,
      selectedTools: user.selectedTools,
      onboardingCompletedAt: user.onboardingCompletedAt,
      onboardingStep: user.onboardingStep,
      isCompleted: !!user.onboardingCompletedAt,
    };
  }),

  /**
   * Update user's profile (name, email opt-in) and advance to step 2
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        emailMarketingOptIn: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, emailMarketingOptIn } = input;
      const userId = ctx.session.user.id;

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          name,
          emailMarketingOptIn,
          onboardingStep: 2,
        },
        select: {
          name: true,
          emailMarketingOptIn: true,
          onboardingStep: true,
        },
      });

      return {
        success: true,
        name: updatedUser.name,
        emailMarketingOptIn: updatedUser.emailMarketingOptIn,
        nextStep: updatedUser.onboardingStep,
      };
    }),

  /**
   * Upload profile image and save URL to user record
   */
  uploadProfileImage: protectedProcedure
    .input(
      z.object({
        base64Data: z.string(),
        contentType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { base64Data } = input;
      const userId = ctx.session.user.id;

      // Upload to Vercel Blob
      const filename = `profile-images/${userId}.png`;
      const blob = await uploadToBlob(base64Data, filename);

      // Update user's image field
      await ctx.db.user.update({
        where: { id: userId },
        data: {
          image: blob.url,
        },
      });

      return {
        success: true,
        imageUrl: blob.url,
      };
    }),

  /**
   * Update user's selected tools and advance to step 3
   */
  updateTools: protectedProcedure
    .input(
      z.object({
        selectedTools: z.array(z.string()).max(20),
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

      if (currentUser.onboardingStep !== 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must complete profile setup first",
        });
      }

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          selectedTools,
          onboardingStep: 3,
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

      if (currentUser.onboardingStep !== 3) {
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
            description: projectDescription ?? `My first project - created during onboarding${template ? ` using ${template} template` : ""}`,
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
          },
          select: {
            onboardingCompletedAt: true,
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
          selectedTools: result.user.selectedTools,
        },
      };
    }),
});
