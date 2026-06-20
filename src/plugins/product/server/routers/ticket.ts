import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { PrismaClient, Prisma } from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { createTicketWithNumber } from "../services/createTicket";
import {
  COMPLETED_TICKET_STATUSES,
  IN_FLIGHT_TICKET_STATUSES,
} from "~/lib/ticket-statuses";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { uploadToBlob } from "~/lib/blob";

const ticketTypeEnum = z.enum([
  "BUG",
  "FEATURE",
  "CHORE",
  "IMPROVEMENT",
  "SPIKE",
  "RESEARCH",
]);

const ticketStatusEnum = z.enum([
  "BACKLOG",
  "NEEDS_REFINEMENT",
  "READY_TO_PLAN",
  "COMMITTED",
  "IN_PROGRESS",
  "BLOCKED",
  "QA",
  "DONE",
  "DEPLOYED",
  "ARCHIVED",
]);

async function loadTicketWithAccess(
  db: PrismaClient,
  userId: string,
  ticketId: string,
) {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      productId: true,
      // T7: pull the previous mutable fields so the update procedure can
      // compute fieldsChanged / status transition without a second query.
      title: true,
      body: true,
      type: true,
      status: true,
      priority: true,
      points: true,
      branchName: true,
      prUrl: true,
      designUrl: true,
      specUrl: true,
      links: true,
      epicId: true,
      featureId: true,
      cycleId: true,
      scopeId: true,
      assigneeId: true,
      product: { select: { workspaceId: true } },
    },
  });
  if (!ticket) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  await assertWorkspaceMember(
    db,
    userId,
    ticket.product.workspaceId,
  );
  return ticket;
}

/** Minimal ticket shape returned for dependency edges. */
const DEP_TICKET_SELECT = {
  id: true,
  number: true,
  shortId: true,
  title: true,
  status: true,
  priority: true,
  assignee: { select: { id: true, name: true, image: true } },
} as const;

/**
 * BFS from `startId` following depsOut edges. Returns true if `targetId` is
 * transitively reachable. Used to prevent cycles when adding a dependency.
 */
async function wouldCreateCycle(
  db: PrismaClient | Prisma.TransactionClient,
  startId: string,
  targetId: string,
): Promise<boolean> {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = await db.ticketDependency.findMany({
      where: { ticketId: current },
      select: { dependsOnId: true },
    });
    for (const e of edges) {
      if (e.dependsOnId === targetId) return true;
      if (!visited.has(e.dependsOnId)) queue.push(e.dependsOnId);
    }
  }
  return false;
}

async function loadTemplateWithAccess(
  db: PrismaClient,
  userId: string,
  templateId: string,
) {
  const template = await db.ticketTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, workspaceId: true },
  });
  if (!template) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Ticket template not found",
    });
  }
  await assertWorkspaceMember(db, userId, template.workspaceId);
  return template;
}

export const ticketRouter = createTRPCRouter({
  // ────────────────── Tickets ──────────────────
  list: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        status: ticketStatusEnum.optional(),
        type: ticketTypeEnum.optional(),
        featureId: z.string().optional(),
        epicId: z.string().optional(),
        cycleId: z.string().optional(),
        assigneeId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      const tickets = await ctx.db.ticket.findMany({
        where: {
          productId: input.productId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.featureId ? { featureId: input.featureId } : {}),
          ...(input.epicId ? { epicId: input.epicId } : {}),
          ...(input.cycleId ? { cycleId: input.cycleId } : {}),
          ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          assignee: { select: { id: true, name: true, image: true } },
          feature: { select: { id: true, name: true } },
          epic: { select: { id: true, name: true } },
          cycle: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
          tags: { include: { tag: true } },
          depsOut: { select: { dependsOn: { select: { status: true } } } },
          _count: { select: { actions: true, comments: true } },
        },
      });

      return tickets.map((t) => {
        const openBlockerCount = t.depsOut.filter(
          (d) => !COMPLETED_TICKET_STATUSES.includes(d.dependsOn.status),
        ).length;
        const isBlocked =
          openBlockerCount > 0 && IN_FLIGHT_TICKET_STATUSES.includes(t.status);
        const { depsOut: _depsOut, ...rest } = t;
        return { ...rest, openBlockerCount, isBlocked };
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ticket = await ctx.db.ticket.findUnique({
        where: { id: input.id },
        include: {
          product: {
            select: { id: true, slug: true, workspaceId: true, name: true, funTicketIds: true },
          },
          assignee: {
            select: { id: true, name: true, email: true, image: true },
          },
          createdBy: { select: { id: true, name: true, image: true } },
          feature: { select: { id: true, name: true, status: true } },
          epic: { select: { id: true, name: true, status: true } },
          cycle: { select: { id: true, name: true, startDate: true, endDate: true } },
          scope: { select: { id: true, version: true } },
          tags: { include: { tag: true } },
          actions: {
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              completedAt: true,
              kanbanStatus: true,
              priority: true,
              dueDate: true,
              projectId: true,
              workspaceId: true,
              assignees: {
                include: {
                  user: { select: { id: true, name: true, image: true } },
                },
              },
            },
          },
          comments: {
            orderBy: { createdAt: "desc" },
            include: {
              author: { select: { id: true, name: true, image: true } },
            },
          },
          depsOut: {
            orderBy: { createdAt: "asc" },
            select: { id: true, dependsOn: { select: DEP_TICKET_SELECT } },
          },
          depsIn: {
            orderBy: { createdAt: "asc" },
            select: { id: true, ticket: { select: DEP_TICKET_SELECT } },
          },
        },
      });
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        ticket.product.workspaceId,
      );

      const dependsOn = ticket.depsOut.map((d) => d.dependsOn);
      const requiredFor = ticket.depsIn.map((d) => d.ticket);
      const openBlockerCount = dependsOn.filter(
        (d) => !COMPLETED_TICKET_STATUSES.includes(d.status),
      ).length;
      const isBlocked =
        openBlockerCount > 0 && IN_FLIGHT_TICKET_STATUSES.includes(ticket.status);

      const { depsOut: _depsOut, depsIn: _depsIn, ...rest } = ticket;
      return { ...rest, dependsOn, requiredFor, openBlockerCount, isBlocked };
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        title: boundedText("Title", 300, { min: 1 }),
        body: boundedText("Body", TEXT_LIMITS.LARGE).optional(),
        type: ticketTypeEnum.optional(),
        status: ticketStatusEnum.optional(),
        priority: z.number().int().min(0).max(4).optional(),
        points: z.number().optional(),
        branchName: boundedText("Branch name", TEXT_LIMITS.LABEL).optional(),
        prUrl: z.string().url().max(500).optional(),
        designUrl: z.string().url().max(500).optional(),
        specUrl: z.string().url().max(500).optional(),
        links: z.record(z.string(), z.string()).optional(),
        epicId: z.string().optional(),
        featureId: z.string().optional(),
        cycleId: z.string().optional(),
        scopeId: z.string().optional(),
        assigneeId: z.string().optional(),
        templateId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const product = await loadProductWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.productId,
      );

      // If templateId provided, load its body as the starting body (unless body already given)
      let body = input.body;
      if (!body && input.templateId) {
        const template = await ctx.db.ticketTemplate.findUnique({
          where: { id: input.templateId },
          select: { body: true, workspaceId: true },
        });
        if (template && template.workspaceId === product.workspaceId) {
          body = template.body;
        }
      }

      // Counter increment, shortId, create, and activity-feed write all live
      // in the shared service (ADR-0016). Access was already verified by
      // loadProductWithAccess above; the service trusts the caller.
      return createTicketWithNumber(ctx.db, {
        productId: input.productId,
        workspaceId: product.workspaceId,
        createdById: ctx.session.user.id,
        title: input.title,
        body,
        type: input.type,
        status: input.status,
        priority: input.priority,
        points: input.points,
        branchName: input.branchName,
        prUrl: input.prUrl,
        designUrl: input.designUrl,
        specUrl: input.specUrl,
        links: input.links,
        epicId: input.epicId,
        featureId: input.featureId,
        cycleId: input.cycleId,
        scopeId: input.scopeId,
        assigneeId: input.assigneeId,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: boundedText("Title", 300, { min: 1 }).optional(),
        body: boundedText("Body", TEXT_LIMITS.LARGE).optional(),
        type: ticketTypeEnum.optional(),
        status: ticketStatusEnum.optional(),
        priority: z.number().int().min(0).max(4).nullable().optional(),
        points: z.number().nullable().optional(),
        branchName: boundedText("Branch name", TEXT_LIMITS.LABEL).nullable().optional(),
        prUrl: z.string().url().max(500).nullable().optional(),
        designUrl: z.string().url().max(500).nullable().optional(),
        specUrl: z.string().url().max(500).nullable().optional(),
        links: z.record(z.string(), z.string()).nullable().optional(),
        epicId: z.string().nullable().optional(),
        featureId: z.string().nullable().optional(),
        cycleId: z.string().nullable().optional(),
        scopeId: z.string().nullable().optional(),
        assigneeId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const previousTicket = await loadTicketWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.id,
      );

      const { id, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };

      // Auto-track completedAt when transitioning to a completed status
      if (input.status && COMPLETED_TICKET_STATUSES.includes(input.status)) {
        data.completedAt = new Date();
      } else if (input.status) {
        data.completedAt = null;
      }

      const updatedTicket = await ctx.db.ticket.update({
        where: { id },
        data,
      });

      // T7: workspace activity feed instrumentation.
      //  - status moved → fire `status_changed`
      //  - otherwise diff `rest` against the pre-update ticket and fire
      //    `updated` with fieldsChanged (skip if nothing actually moved).
      const activityWorkspaceId = previousTicket.product.workspaceId;
      const statusChanged =
        input.status !== undefined && input.status !== previousTicket.status;
      if (statusChanged) {
        await recordActivity(ctx.db, {
          workspaceId: activityWorkspaceId,
          userId: ctx.session.user.id,
          entityType: "ticket",
          entityId: id,
          action: "status_changed",
          metadata: { from: previousTicket.status, to: input.status! },
        }).catch(() => {
          /* instrumentation failure is non-fatal */
        });
      } else {
        const previousRecord = previousTicket as unknown as Record<
          string,
          unknown
        >;
        const fieldsChanged = Object.keys(rest).filter((key) => {
          const incoming = (rest as Record<string, unknown>)[key];
          if (incoming === undefined) return false;
          if (!(key in previousRecord)) return true;
          const existing = previousRecord[key];
          // links is a Json object - JSON-stringify for a coarse equality check.
          if (
            existing !== null &&
            typeof existing === "object" &&
            incoming !== null &&
            typeof incoming === "object"
          ) {
            return JSON.stringify(existing) !== JSON.stringify(incoming);
          }
          return existing !== incoming;
        });
        if (fieldsChanged.length > 0) {
          await recordActivity(ctx.db, {
            workspaceId: activityWorkspaceId,
            userId: ctx.session.user.id,
            entityType: "ticket",
            entityId: id,
            action: "updated",
            metadata: { fieldsChanged },
          }).catch(() => {
            /* instrumentation failure is non-fatal */
          });
        }
      }

      return updatedTicket;
    }),

  uploadImage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        base64Data: z.string().min(1),
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]).default("image/png"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadTicketWithAccess(ctx.db, ctx.session.user.id, input.id);
      const approxBytes = Math.floor((input.base64Data.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Image too large. Please use an image under 5MB.",
        });
      }
      const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
      const ext = extMap[input.mimeType] ?? "png";
      const timestamp = new Date().toISOString().replace(/[/:]/g, "-");
      const filename = `screenshots/tickets/${input.id}/${timestamp}.${ext}`;
      const blob = await uploadToBlob(input.base64Data, filename, input.mimeType);
      return { url: blob.url };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadTicketWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.ticket.delete({ where: { id: input.id } });
      return { success: true };
    }),

  search: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        query: z.string().max(200).optional(),
        excludeTicketId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);
      const q = (input.query ?? "").trim();
      const limit = input.limit ?? 20;

      const numberFromQuery = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;

      return ctx.db.ticket.findMany({
        where: {
          productId: input.productId,
          ...(input.excludeTicketId ? { id: { not: input.excludeTicketId } } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { shortId: { contains: q, mode: "insensitive" as const } },
                  ...(numberFromQuery !== undefined ? [{ number: numberFromQuery }] : []),
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }],
        take: limit,
        select: DEP_TICKET_SELECT,
      });
    }),

  addDependency: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        dependsOnId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.ticketId === input.dependsOnId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A ticket cannot depend on itself.",
        });
      }

      const [ticket, dependsOn] = await Promise.all([
        ctx.db.ticket.findUnique({
          where: { id: input.ticketId },
          select: { id: true, productId: true, product: { select: { workspaceId: true } } },
        }),
        ctx.db.ticket.findUnique({
          where: { id: input.dependsOnId },
          select: { id: true, productId: true },
        }),
      ]);
      if (!ticket || !dependsOn) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      }
      if (ticket.productId !== dependsOn.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dependencies must be within the same product.",
        });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        ticket.product.workspaceId,
      );

      return ctx.db.$transaction(async (tx) => {
        // Cycle check: would adding ticketId -> dependsOnId let dependsOnId reach ticketId?
        if (await wouldCreateCycle(tx, input.dependsOnId, input.ticketId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This would create a dependency cycle.",
          });
        }

        return tx.ticketDependency.upsert({
          where: {
            ticketId_dependsOnId: {
              ticketId: input.ticketId,
              dependsOnId: input.dependsOnId,
            },
          },
          create: {
            ticketId: input.ticketId,
            dependsOnId: input.dependsOnId,
            createdById: ctx.session.user.id,
          },
          update: {},
          select: {
            id: true,
            dependsOn: { select: DEP_TICKET_SELECT },
          },
        });
      });
    }),

  removeDependency: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        dependsOnId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadTicketWithAccess(ctx.db, ctx.session.user.id, input.ticketId);
      await ctx.db.ticketDependency.deleteMany({
        where: { ticketId: input.ticketId, dependsOnId: input.dependsOnId },
      });
      return { success: true };
    }),

  // ────────────────── Ticket comments ──────────────────
  addComment: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        content: boundedText("Comment", TEXT_LIMITS.MEDIUM, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parentTicket = await loadTicketWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.ticketId,
      );
      const comment = await ctx.db.ticketComment.create({
        data: {
          ticketId: input.ticketId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: { author: { select: { id: true, name: true, image: true } } },
      });

      // T7: workspace activity feed instrumentation.
      await recordActivity(ctx.db, {
        workspaceId: parentTicket.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "ticket_comment",
        entityId: comment.id,
        action: "created",
        metadata: {
          ticketId: input.ticketId,
          snippet: input.content.slice(0, 120),
        },
      }).catch(() => {
        /* instrumentation failure is non-fatal */
      });

      return comment;
    }),

  deleteComment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.ticketComment.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          authorId: true,
          ticket: {
            select: { product: { select: { workspaceId: true } } },
          },
        },
      });
      if (!comment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        comment.ticket.product.workspaceId,
      );
      if (comment.authorId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own comments",
        });
      }
      await ctx.db.ticketComment.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ────────────────── Action ↔ Ticket linking ──────────────────
  linkAction: protectedProcedure
    .input(z.object({ ticketId: z.string(), actionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadTicketWithAccess(ctx.db, ctx.session.user.id, input.ticketId);
      const action = await ctx.db.action.findFirst({
        where: { id: input.actionId, createdById: ctx.session.user.id },
        select: { id: true },
      });
      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found or not owned by caller",
        });
      }
      return ctx.db.action.update({
        where: { id: input.actionId },
        data: { ticketId: input.ticketId },
      });
    }),

  unlinkAction: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const action = await ctx.db.action.findFirst({
        where: { id: input.actionId, createdById: ctx.session.user.id },
        select: { id: true, ticketId: true },
      });
      if (!action) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
      }
      return ctx.db.action.update({
        where: { id: input.actionId },
        data: { ticketId: null },
      });
    }),

  // ────────────────── Ticket Templates ──────────────────
  listTemplates: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        productId: z.string().optional(),
        type: ticketTypeEnum.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );
      return ctx.db.ticketTemplate.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.productId !== undefined
            ? {
                OR: [{ productId: input.productId }, { productId: null }],
              }
            : {}),
          ...(input.type ? { type: input.type } : {}),
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });
    }),

  createTemplate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        productId: z.string().optional(),
        type: ticketTypeEnum,
        name: boundedText("Name", 120, { min: 1 }),
        body: boundedText("Body", TEXT_LIMITS.LARGE),
        isDefault: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );
      return ctx.db.ticketTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          productId: input.productId,
          type: input.type,
          name: input.name,
          body: input.body,
          isDefault: input.isDefault ?? false,
        },
      });
    }),

  updateTemplate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: boundedText("Name", 120, { min: 1 }).optional(),
        body: boundedText("Body", TEXT_LIMITS.LARGE).optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadTemplateWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.ticketTemplate.update({ where: { id }, data });
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadTemplateWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.ticketTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
