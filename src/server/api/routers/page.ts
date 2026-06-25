import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { checkStaleWrite } from "~/lib/prd/stale-write";
import {
  getKnowledgePageAccess,
  canViewKnowledgePage,
  canEditKnowledgePage,
  buildKnowledgePageAccessWhere,
  getProjectAccess,
  canEditProject,
  getWorkspaceMembership,
  hasMinimumWorkspaceRole,
} from "~/server/services/access";

/**
 * Canonical ProseMirror document shape for a Page body (ADR-0024). Same loose
 * shape the Feature PRD router uses — the editor owns the real schema; the
 * server only stores it as JSON.
 */
const prosemirrorDoc = z.record(z.string(), z.unknown());

/** A Page reduced to exactly what the access resolver needs. */
const PAGE_ACCESS_SELECT = {
  id: true,
  createdById: true,
  projectId: true,
  workspaceId: true,
  docVersion: true,
} satisfies Prisma.KnowledgePageSelect;

async function loadPageForAccess(db: PrismaClient, id: string) {
  const page = await db.knowledgePage.findUnique({
    where: { id },
    select: PAGE_ACCESS_SELECT,
  });
  if (!page) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
  }
  return page;
}

async function ensurePageAccess(
  db: PrismaClient,
  userId: string,
  page: { createdById: string; projectId: string | null; workspaceId: string },
  permission: "view" | "edit",
): Promise<void> {
  const access = await getKnowledgePageAccess(db, userId, page);
  const allowed =
    permission === "view"
      ? canViewKnowledgePage(access)
      : canEditKnowledgePage(access);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        permission === "view"
          ? "You don't have access to this page"
          : "You don't have permission to edit this page",
    });
  }
}

/**
 * Gate Page creation / project re-assignment against the target scope, since no
 * row exists yet to feed the resolver. A project-linked Page requires edit
 * access to that project (restriction respected) and the project must live in
 * the same workspace (a project-linked Page always inherits the project's
 * workspace — mirrors the Meeting coherence rule). A project-less Page requires
 * a non-viewer workspace role.
 */
async function assertCanPlacePage(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }
    if (project.workspaceId !== workspaceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The project belongs to a different workspace",
      });
    }
    const access = await getProjectAccess(db, userId, projectId);
    if (!canEditProject(access)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have permission to add a page to this project",
      });
    }
    return;
  }

  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership || !hasMinimumWorkspaceRole(membership.role, "member")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You need member access to this workspace to create a page",
    });
  }
}

export const pageRouter = createTRPCRouter({
  /**
   * List the Pages a user can see in a workspace (visibility per ADR-0033 /
   * `buildKnowledgePageAccessWhere`), newest-edited first. Optional `projectId`
   * filter and case-insensitive title `search`.
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const filters: Prisma.KnowledgePageWhereInput[] = [
        buildKnowledgePageAccessWhere(userId),
        { workspaceId: input.workspaceId },
      ];
      if (input.projectId) {
        filters.push({ projectId: input.projectId });
      }
      if (input.search?.trim()) {
        filters.push({
          title: { contains: input.search.trim(), mode: "insensitive" },
        });
      }

      return ctx.db.knowledgePage.findMany({
        where: { AND: filters },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          projectId: true,
          includeInSearch: true,
          updatedAt: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.knowledgePage.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });
      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");
      return page;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullish(),
        title: boundedText("Title", TEXT_LIMITS.LABEL).optional(),
        body: boundedText("Body", TEXT_LIMITS.LARGE).optional(),
        bodyDoc: prosemirrorDoc.optional(),
        includeInSearch: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertCanPlacePage(
        ctx.db,
        userId,
        input.workspaceId,
        input.projectId,
      );

      return ctx.db.knowledgePage.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId ?? null,
          title: input.title?.trim() ? input.title.trim() : "Untitled",
          body: input.body,
          bodyDoc: input.bodyDoc as Prisma.InputJsonValue | undefined,
          includeInSearch: input.includeInSearch ?? true,
          createdById: userId,
        },
      });
    }),

  /**
   * Update a Page. The body-save path (ADR-0024) carries `bodyDoc` (canonical
   * ProseMirror) plus its derived Markdown `body`, guarded by an
   * optimistic-concurrency compare-and-set on `docVersion`; metadata-only
   * updates (title, project link, search toggle) skip the version dance.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: boundedText("Title", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        projectId: z.string().nullish(),
        includeInSearch: z.boolean().optional(),
        bodyDoc: prosemirrorDoc.optional(),
        body: boundedText("Body", TEXT_LIMITS.LARGE).optional(),
        baseVersion: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "edit");

      const { id, bodyDoc, body, baseVersion, projectId, ...rest } = input;

      // Re-assigning the project changes visibility + workspace coherence, so
      // re-run placement gating for the new target (null = detach to workspace).
      const projectIdProvided = projectId !== undefined;
      if (projectIdProvided) {
        await assertCanPlacePage(
          ctx.db,
          userId,
          page.workspaceId,
          projectId,
        );
      }

      // A Markdown-source write — `body` set without `bodyDoc` — comes from a
      // non-editor writer (the Zoe agent authors Markdown; the rich editor
      // always sends both). Treat the Markdown as canonical: null out `bodyDoc`
      // and bump `docVersion` so the editor re-derives the ProseMirror doc from
      // the new Markdown on next open (the same lazy migration a null bodyDoc
      // triggers), instead of rendering a now-stale canonical doc.
      const markdownSourceWrite = body !== undefined && bodyDoc === undefined;
      const data: Prisma.KnowledgePageUpdateInput = {
        ...rest,
        ...(projectIdProvided
          ? {
              project: projectId
                ? { connect: { id: projectId } }
                : { disconnect: true },
            }
          : {}),
        ...(body !== undefined ? { body } : {}),
        ...(markdownSourceWrite
          ? { bodyDoc: Prisma.DbNull, docVersion: { increment: 1 } }
          : {}),
      };

      // Body autosave path: optimistic-concurrency guard + atomic version bump.
      if (bodyDoc !== undefined) {
        if (baseVersion === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "baseVersion is required when saving the page body",
          });
        }
        const decision = checkStaleWrite({
          storedVersion: page.docVersion,
          baseVersion,
        });
        if (!decision.accept) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              decision.reason === "stale"
                ? "This page was updated in another tab or by another member. Reload to get the latest version."
                : "Stale document version — reload and try again.",
          });
        }
        // The WHERE on docVersion closes the read→write race so two concurrent
        // saves can't both bump from the same base.
        const res = await ctx.db.knowledgePage.updateMany({
          where: { id, docVersion: baseVersion },
          data: {
            ...rest,
            ...(projectIdProvided ? { projectId: projectId ?? null } : {}),
            ...(body !== undefined ? { body } : {}),
            bodyDoc: bodyDoc as Prisma.InputJsonValue,
            docVersion: { increment: 1 },
          },
        });
        if (res.count === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This page was updated concurrently. Reload to get the latest version.",
          });
        }
        return { id, docVersion: decision.nextVersion };
      }

      return ctx.db.knowledgePage.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");
      await ctx.db.knowledgePage.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
