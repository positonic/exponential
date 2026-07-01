import { z } from "zod";
import { type PrismaClient, type Prisma } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { uniqueFormSlug } from "~/server/services/forms/formSlug";
import {
  formFieldSchema,
  formDestinationSchema,
  parseFormFields,
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
      const slug = await uniqueFormSlug(ctx.db, input.name);
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
        description: z.string().max(20000).nullable().optional(),
        fields: z.array(formFieldSchema).optional(),
        destinations: z.array(formDestinationSchema).optional(),
        isActive: z.boolean().optional(),
        confirmationMessage: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await loadFormForUser(ctx.db, input.id, ctx.session.user.id);

      if (input.destinations) {
        // Validate destination config against the form's effective fields (the
        // ones being saved, or the stored ones if fields aren't part of this
        // update).
        const effectiveFields = input.fields ?? parseFormFields(form.fields);
        const registry = createFormDestinationRegistry(ctx.db);
        for (const dest of input.destinations) {
          if (!registry.has(dest.type)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unknown destination type: ${dest.type}`,
            });
          }
          if (dest.type === "create_crm_contact") {
            if (
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
            // The email is the dedup key: without an Email field mapped, every
            // submission would create a fresh, never-deduped contact and fire an
            // automation with no recipient. Require a mapping to an email field.
            const fieldMap =
              dest.config.fieldMap && typeof dest.config.fieldMap === "object"
                ? (dest.config.fieldMap as Record<string, unknown>)
                : {};
            const emailKey =
              typeof fieldMap.email === "string" ? fieldMap.email : "";
            const emailField = effectiveFields.find((f) => f.key === emailKey);
            if (!emailField || emailField.type !== "email") {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Create CRM contact requires an Email field mapped to the contact's email.",
              });
            }
          }
          if (dest.type === "create_deal") {
            const pipelineId =
              typeof dest.config.pipelineId === "string"
                ? dest.config.pipelineId
                : "";
            const stageId =
              typeof dest.config.stageId === "string"
                ? dest.config.stageId
                : "";
            if (!pipelineId || !stageId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Create deal requires a pipeline and a stage.",
              });
            }
            if (
              !(
                typeof dest.config.customerType === "string" &&
                dest.config.customerType.trim()
              )
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Create deal requires a Customer type for the applicant.",
              });
            }
            // Same email-dedup requirement as create_crm_contact (the deal is
            // linked to the upserted contact).
            const fieldMap =
              dest.config.contactFieldMap &&
              typeof dest.config.contactFieldMap === "object"
                ? (dest.config.contactFieldMap as Record<string, unknown>)
                : {};
            const emailKey =
              typeof fieldMap.email === "string" ? fieldMap.email : "";
            const emailField = effectiveFields.find((f) => f.key === emailKey);
            if (!emailField || emailField.type !== "email") {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Create deal requires an Email field mapped to the applicant's email.",
              });
            }
            // The stage must belong to the chosen pipeline, which must be a
            // pipeline Project in this workspace.
            const stage = await ctx.db.pipelineStage.findFirst({
              where: {
                id: stageId,
                projectId: pipelineId,
                project: { workspaceId: form.workspaceId, type: "pipeline" },
              },
              select: { id: true },
            });
            if (!stage) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Create deal: the selected stage does not belong to the chosen pipeline.",
              });
            }
          }
          if (dest.type === "create_insight") {
            // A create_insight config needs a target product and a mapped
            // title (ADR-0037). Body is optional; no email is required.
            const productId =
              typeof dest.config.productId === "string"
                ? dest.config.productId
                : "";
            if (!productId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Create insight requires a target product.",
              });
            }
            const fieldMap =
              dest.config.fieldMap && typeof dest.config.fieldMap === "object"
                ? (dest.config.fieldMap as Record<string, unknown>)
                : {};
            const titleKey =
              typeof fieldMap.title === "string" ? fieldMap.title : "";
            if (!effectiveFields.some((f) => f.key === titleKey)) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Create insight requires a form field mapped to the insight's title.",
              });
            }
            // The product must live in this form's own workspace — a form is
            // workspace-owned; an Insight is product-scoped (re-checked at
            // submit by the destination).
            const product = await ctx.db.product.findFirst({
              where: { id: productId, workspaceId: form.workspaceId },
              select: { id: true },
            });
            if (!product) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Create insight: the selected product is not in this form's workspace.",
              });
            }
          }
        }
      }

      await ctx.db.form.update({
        where: { id: form.id },
        data: {
          name: input.name,
          description:
            input.description === undefined ? undefined : input.description,
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
