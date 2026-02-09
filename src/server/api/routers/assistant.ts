import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const assistantRouter = createTRPCRouter({
  /** Create a new custom assistant for a workspace */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(50),
        emoji: z.string().max(10).optional(),
        personality: z.string().min(1).max(10000),
        instructions: z.string().max(10000).optional(),
        userContext: z.string().max(5000).optional(),
        isDefault: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId, isDefault, ...data } = input;

      // If setting as default, unset any existing default first
      if (isDefault) {
        await ctx.db.assistant.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return ctx.db.assistant.create({
        data: {
          ...data,
          workspaceId,
          createdById: ctx.session.user.id,
          isDefault,
        },
      });
    }),

  /** Update an existing assistant */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        emoji: z.string().max(10).optional().nullable(),
        personality: z.string().min(1).max(10000).optional(),
        instructions: z.string().max(10000).optional().nullable(),
        userContext: z.string().max(5000).optional().nullable(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, isDefault, ...data } = input;

      const existing = await ctx.db.assistant.findUnique({ where: { id } });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant not found" });
      }

      // If setting as default, unset any existing default first
      if (isDefault) {
        await ctx.db.assistant.updateMany({
          where: { workspaceId: existing.workspaceId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return ctx.db.assistant.update({
        where: { id },
        data: {
          ...data,
          ...(isDefault !== undefined && { isDefault }),
        },
      });
    }),

  /** Get a single assistant by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const assistant = await ctx.db.assistant.findUnique({ where: { id: input.id } });
      if (!assistant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant not found" });
      }
      return assistant;
    }),

  /** List all assistants for a workspace */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.assistant.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    }),

  /** Get the default assistant for a workspace (or null) */
  getDefault: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.assistant.findFirst({
        where: { workspaceId: input.workspaceId, isDefault: true },
      });
    }),

  /** Delete an assistant */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.assistant.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant not found" });
      }
      return ctx.db.assistant.delete({ where: { id: input.id } });
    }),

  /** Set an assistant as the workspace default */
  setDefault: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const assistant = await ctx.db.assistant.findUnique({ where: { id: input.id } });
      if (!assistant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant not found" });
      }

      // Unset existing default
      await ctx.db.assistant.updateMany({
        where: { workspaceId: assistant.workspaceId, isDefault: true },
        data: { isDefault: false },
      });

      // Set new default
      return ctx.db.assistant.update({
        where: { id: input.id },
        data: { isDefault: true },
      });
    }),
});
