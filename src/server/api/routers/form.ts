import { z } from "zod";
import { type PrismaClient, type Prisma } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { uniqueFormSlug } from "~/server/services/forms/formSlug";
import {
  formFieldSchema,
  formDestinationSchema,
} from "~/server/services/forms/formSchema";
import { createFormDestinationRegistry } from "~/server/services/forms/FormDestinationRegistry";

/**
 * Admin router for the generic **Forms** subsystem (CONTEXT.md → Forms,
 * ADR-0029). Authenticated + workspace-membership-checked. The public intake is
 * a separate unauthenticated API route. Slugs are stable after creation so
 * shared public links don't break.
 */
async function assertMember(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
) {
  const membership = await db.workspaceUser.findFirst({
    where: { workspaceId, userId },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this workspace",
    });
  }
}

async function loadFormForUser(db: PrismaClient, id: string, userId: string) {
  const form = await db.form.findUnique({ where: { id } });
  if (!form) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
  }
  await assertMember(db, form.workspaceId, userId);
  return form;
}

export const formRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.workspaceId, ctx.session.user.id);
      return ctx.db.form.findMany({
        where: { workspaceId: input.workspaceId },
        include: { _count: { select: { submissions: true } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return loadFormForUser(ctx.db, input.id, ctx.session.user.id);
    }),

  create: protectedProcedure
    .input(
      z.object({ workspaceId: z.string(), name: z.string().min(1).max(200) }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.workspaceId, ctx.session.user.id);
      const slug = await uniqueFormSlug(ctx.db, input.workspaceId, input.name);
      const form = await ctx.db.form.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          name: input.name,
          slug,
          isActive: false,
        },
      });
      return { id: form.id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        fields: z.array(formFieldSchema).optional(),
        destinations: z.array(formDestinationSchema).optional(),
        isActive: z.boolean().optional(),
        confirmationMessage: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await loadFormForUser(ctx.db, input.id, ctx.session.user.id);

      if (input.destinations) {
        const registry = createFormDestinationRegistry(ctx.db);
        for (const dest of input.destinations) {
          if (!registry.has(dest.type)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unknown destination type: ${dest.type}`,
            });
          }
          if (
            dest.type === "create_crm_contact" &&
            !(
              typeof dest.config.customerType === "string" &&
              dest.config.customerType.trim()
            )
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Create CRM contact requires a Customer type.",
            });
          }
        }
      }

      await ctx.db.form.update({
        where: { id: form.id },
        data: {
          name: input.name,
          fields: input.fields as Prisma.InputJsonValue | undefined,
          destinations: input.destinations as Prisma.InputJsonValue | undefined,
          isActive: input.isActive,
          confirmationMessage:
            input.confirmationMessage === undefined
              ? undefined
              : input.confirmationMessage,
        },
      });
      return { id: form.id };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const form = await loadFormForUser(ctx.db, input.id, ctx.session.user.id);
      await ctx.db.form.delete({ where: { id: form.id } });
      return { id: form.id };
    }),

  listSubmissions: protectedProcedure
    .input(
      z.object({
        formId: z.string(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadFormForUser(ctx.db, input.formId, ctx.session.user.id);
      return ctx.db.formSubmission.findMany({
        where: { formId: input.formId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});
