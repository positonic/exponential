import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { uploadToBlob } from "~/lib/blob";
import { slugify } from "~/utils/slugify";

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
        workRole: true,
        workFunction: true,
        usagePurposes: true,
        selectedTools: true,
        onboardingCompletedAt: true,
        onboardingStep: true,
        // New fields for enhanced onboarding
        attributionSource: true,
        workHoursEnabled: true,
        workDaysJson: true,
        workHoursStart: true,
        workHoursEnd: true,
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
      workRole: user.workRole,
      workFunction: user.workFunction,
      usagePurposes: user.usagePurposes,
      selectedTools: user.selectedTools,
      onboardingCompletedAt: user.onboardingCompletedAt,
      onboardingStep: user.onboardingStep,
      isCompleted: !!user.onboardingCompletedAt,
      // New fields for enhanced onboarding
      attributionSource: user.attributionSource,
      workHoursEnabled: user.workHoursEnabled,
      workDaysJson: user.workDaysJson,
      workHoursStart: user.workHoursStart,
      workHoursEnd: user.workHoursEnd,
    };
  }),

  /**
   * Update user's profile (name, email opt-in, attribution) and advance to step 2
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        emailMarketingOptIn: z.boolean(),
        attributionSource: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, emailMarketingOptIn, attributionSource } = input;
      const userId = ctx.session.user.id;

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          name,
          emailMarketingOptIn,
          attributionSource,
          onboardingStep: 2,
        },
        select: {
          name: true,
          emailMarketingOptIn: true,
          attributionSource: true,
          onboardingStep: true,
        },
      });

      return {
        success: true,
        name: updatedUser.name,
        emailMarketingOptIn: updatedUser.emailMarketingOptIn,
        attributionSource: updatedUser.attributionSource,
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
   * Update user's work profile (role, function, usage purposes) and advance to step 3
   */
  updateWorkProfile: protectedProcedure
    .input(
      z.object({
        workRole: z.string().optional(),
        workFunction: z.array(z.string()),
        usagePurposes: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { workRole, workFunction, usagePurposes } = input;
      const userId = ctx.session.user.id;

      // Verify user is on step 2
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
          workRole,
          workFunction,
          usagePurposes,
          onboardingStep: 3,
        },
        select: {
          workRole: true,
          workFunction: true,
          usagePurposes: true,
          onboardingStep: true,
        },
      });

      return {
        success: true,
        workRole: updatedUser.workRole,
        workFunction: updatedUser.workFunction,
        usagePurposes: updatedUser.usagePurposes,
        nextStep: updatedUser.onboardingStep,
      };
    }),

  /**
   * Update user's selected tools and advance to step 4
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

      // Verify user is on step 3
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
          message: "Must complete work profile first",
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
   * Update user's work hours settings
   */
  updateWorkHours: protectedProcedure
    .input(
      z.object({
        workHoursEnabled: z.boolean(),
        workDays: z.array(z.string()), // ["monday", "tuesday", ...]
        workHoursStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid HH:MM (00:00-23:59)'), // "09:00"
        workHoursEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid HH:MM (00:00-23:59)'), // "17:00"
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { workHoursEnabled, workDays, workHoursStart, workHoursEnd } = input;
      const userId = ctx.session.user.id;

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: {
          workHoursEnabled,
          workDaysJson: JSON.stringify(workDays),
          workHoursStart,
          workHoursEnd,
          // Advance to step 5 (ready for project creation) in the new onboarding flow
          onboardingStep: 5,
        },
        select: {
          workHoursEnabled: true,
          workDaysJson: true,
          workHoursStart: true,
          workHoursEnd: true,
        },
      });

      return {
        success: true,
        workHoursEnabled: updatedUser.workHoursEnabled,
        workDays: updatedUser.workDaysJson ? JSON.parse(updatedUser.workDaysJson) as string[] : [],
        workHoursStart: updatedUser.workHoursStart,
        workHoursEnd: updatedUser.workHoursEnd,
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
        tasks: z.array(z.object({
          name: z.string().min(1).max(200),
          dueDate: z.date().optional(),
          durationMinutes: z.number().min(5).max(480).optional(), // 5 min to 8 hours
        })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectName, projectDescription, projectPriority, template, tasks } = input;
      const userId = ctx.session.user.id;

      // Verify user is on step 4 or 5
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

      if (currentUser.onboardingStep < 4) {
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

      // Use a transaction to create project, tasks, and complete onboarding atomically
      const result = await ctx.db.$transaction(async (tx) => {
        // Generate a unique slug
        const baseSlug = slugify(projectName);
        let slug = baseSlug;
        let counter = 1;

        // Check if slug exists and increment counter until we find a unique one
        while (await tx.project.findFirst({ where: { slug } })) {
          slug = `${baseSlug}_${counter}`;
          counter++;
        }

        // Create the first project
        const project = await tx.project.create({
          data: {
            name: projectName,
            description: projectDescription ?? `My first project - created during onboarding${template ? ` using ${template} template` : ""}`,
            priority: projectPriority,
            status: "ACTIVE",
            createdById: userId,
            slug,
          },
        });

        // Create tasks (Actions) if provided
        let createdTasks: { id: string; name: string; dueDate: Date | null; duration: number | null }[] = [];
        if (tasks && tasks.length > 0) {
          createdTasks = await Promise.all(
            tasks.map((task) =>
              tx.action.create({
                data: {
                  name: task.name,
                  projectId: project.id,
                  createdById: userId,
                  priority: "MEDIUM",
                  dueDate: task.dueDate,
                  duration: task.durationMinutes,
                  status: "TODO",
                },
                select: {
                  id: true,
                  name: true,
                  dueDate: true,
                  duration: true,
                },
              })
            )
          );
        }

        // Mark onboarding as completed and also mark project setup as completed
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            onboardingCompletedAt: new Date(),
            projectSetupCompletedAt: new Date(),
          },
          select: {
            onboardingCompletedAt: true,
            selectedTools: true,
          },
        });

        return {
          project,
          tasks: createdTasks,
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
        tasks: result.tasks,
        completedAt: result.user.onboardingCompletedAt,
        userData: {
          selectedTools: result.user.selectedTools,
        },
      };
    }),
});
