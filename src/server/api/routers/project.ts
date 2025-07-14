import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { slugify } from "~/utils/slugify";

export const projectRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({
      include: z.object({
        actions: z.boolean()
      }).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.project.findMany({
        where: {
          createdById: ctx.session.user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          actions: input?.include?.actions ?? false,
          goals: true,
          outcomes: true
        }
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.string(),
        priority: z.string(),
        progress: z.number().min(0).max(100).optional().default(0),
        reviewDate: z.date().nullable().optional(),
        nextActionDate: z.date().nullable().optional(),
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Generate a unique slug
      const baseSlug = slugify(input.name);
      let slug = baseSlug;
      let counter = 1;
      
      // Check if slug exists and increment counter until we find a unique one
      while (await ctx.db.project.findFirst({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      return ctx.db.project.create({
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          priority: input.priority,
          progress: input.progress ?? 0,
          slug,
          reviewDate: input.reviewDate ?? null,
          nextActionDate: input.nextActionDate ?? null,
          createdBy: {
            connect: {
              id: ctx.session.user.id,
            },
          },
          goals: input.goalIds?.length ? {
            connect: input.goalIds.map(id => ({ id: parseInt(id) })),
          } : undefined,
          outcomes: input.outcomeIds?.length ? {
            connect: input.outcomeIds.map(id => ({ id })),
          } : undefined,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.project.delete({
        where: {
          id: input.id,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
        priority: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]),
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, goalIds, outcomeIds, ...updateData } = input;
      
      // Generate a unique slug, excluding the current project
      const baseSlug = slugify(updateData.name);
      let slug = baseSlug;
      let counter = 1;
      
      // Check if slug exists (excluding current project) and increment counter until we find a unique one
      while (await ctx.db.project.findFirst({ 
        where: { 
          slug,
          id: { not: id }
        } 
      })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      
      return ctx.db.project.update({
        where: {
          id,
          createdById: ctx.session.user.id,
        },
        data: {
          ...updateData,
          slug,
          goals: goalIds?.length ? {
            set: goalIds.map(id => ({ id: parseInt(id) })),
          } : undefined,
          outcomes: outcomeIds?.length ? {
            set: outcomeIds.map(id => ({ id })),
          } : undefined,
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          goals: true,
          outcomes: true,
          actions: true,
          transcriptionSessions: true,
        },
      });
    }),

  getTeamMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.teamMember.findMany({
        where: {
          projectId: input.projectId,
        },
      });
    }),
}); 