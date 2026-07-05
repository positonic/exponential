import { z } from "zod";
import { randomInt } from "crypto";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  slugifyPageTitle,
} from "~/lib/pages/public-url";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { checkStaleWrite } from "~/lib/prd/stale-write";
import { uploadToBlob } from "~/lib/blob";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
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

/** The publishing state the share popover renders (ADR-0038). */
const PUBLIC_SETTINGS_SELECT = {
  id: true,
  isPublic: true,
  publicId: true,
  publicSlug: true,
  publicSeoIndexed: true,
  publishedAt: true,
} satisfies Prisma.KnowledgePageSelect;

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

/** Mint an 8-char lowercase-alphanumeric public id (ADR-0038). */
function generatePublicId(): string {
  let id = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) {
    id += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  }
  return id;
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
      const access = await getKnowledgePageAccess(
        ctx.db,
        ctx.session.user.id,
        page,
      );
      if (!canViewKnowledgePage(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this page",
        });
      }
      // The editor needs to know whether to render read-only.
      return { ...page, canEdit: canEditKnowledgePage(access) };
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

      const page = await ctx.db.knowledgePage.create({
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

      // Index any seeded body (e.g. agent-authored pages) — no-op when empty.
      if (input.body?.trim()) {
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(page.id);
      }
      return page;
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
        // Body changed → re-index after a settle delay (embeds, or clears when
        // includeInSearch is off / body emptied). Fire-and-forget.
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(id);
        return { id, docVersion: decision.nextVersion };
      }

      const updated = await ctx.db.knowledgePage.update({
        where: { id },
        data,
      });
      // Re-index when the content or its search inclusion changed. A Markdown
      // `body` set without `bodyDoc` is a non-editor write (the Zoe agent) that
      // doesn't take the bodyDoc save path above, so cover it here too.
      if (input.body !== undefined || input.includeInSearch !== undefined) {
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(id);
      }
      return updated;
    }),

  /**
   * Persist the one-time lazy migration of a null `bodyDoc` into the canonical
   * ProseMirror JSON (ADR-0024), mirroring `feature.initDescriptionDoc`. The
   * client converts the Markdown `body` (or an empty doc) on first open and
   * calls this once. Idempotent and write-once: if `bodyDoc` is already set, the
   * existing doc wins and nothing is written.
   */
  initBodyDoc: protectedProcedure
    .input(z.object({ id: z.string(), doc: prosemirrorDoc }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");

      const existing = await ctx.db.knowledgePage.findUnique({
        where: { id: input.id },
        select: { bodyDoc: true },
      });
      if (existing?.bodyDoc != null) {
        return { migrated: false, bodyDoc: existing.bodyDoc };
      }

      const updated = await ctx.db.knowledgePage.update({
        where: { id: input.id },
        data: { bodyDoc: input.doc as Prisma.InputJsonValue },
        select: { bodyDoc: true },
      });
      return { migrated: true, bodyDoc: updated.bodyDoc };
    }),

  /**
   * Upload an image pasted/dropped into the page body (ADR-0024 Tier B),
   * mirroring `feature.uploadImage`: base64 in, public URL out, via Vercel Blob.
   * Gated by the same edit check as saving.
   */
  uploadImage: protectedProcedure
    .input(z.object({ id: z.string(), base64Data: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");

      // Same 5MB cap as feature.uploadImage (base64 is ~4/3 the byte size).
      const approxBytes = Math.floor((input.base64Data.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Image too large. Please use an image under 5MB.",
        });
      }

      const timestamp = new Date().toISOString().replace(/[/:]/g, "-");
      const filename = `screenshots/pages/${input.id}/${timestamp}.png`;
      const blob = await uploadToBlob(input.base64Data, filename);
      return { url: blob.url };
    }),

  /**
   * Publish a Page to the web (ADR-0038). Edit access is the whole gate —
   * including restricted-project Pages; the share popover is the consent
   * surface. First publish mints the immutable `publicId` and derives
   * `publicSlug` from the title; republish reuses both, reviving old links.
   */
  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");

      const existing = await ctx.db.knowledgePage.findUniqueOrThrow({
        where: { id: input.id },
        select: { title: true, publicId: true, publicSlug: true },
      });

      const publicSlug =
        existing.publicSlug ?? slugifyPageTitle(existing.title);

      if (existing.publicId) {
        return ctx.db.knowledgePage.update({
          where: { id: input.id },
          data: { isPublic: true, publicSlug, publishedAt: new Date() },
          select: PUBLIC_SETTINGS_SELECT,
        });
      }

      // Mint the id here rather than in the schema default so it only exists
      // for pages that have actually been published. Retry on the (36^8)
      // collision rather than pre-checking. `publicId: null` in the where
      // guards against a concurrent first publish: the loser of that race
      // must reuse the winner's id, never overwrite an id that may already
      // have been shared.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await ctx.db.knowledgePage.update({
            where: { id: input.id, AND: [{ publicId: null }] },
            data: {
              isPublic: true,
              publicId: generatePublicId(),
              publicSlug,
              publishedAt: new Date(),
            },
            select: PUBLIC_SETTINGS_SELECT,
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // P2002: minted id collided with another page's — remint.
            if (error.code === "P2002") continue;
            // P2025: a concurrent publish minted first — keep its id.
            if (error.code === "P2025") {
              return ctx.db.knowledgePage.update({
                where: { id: input.id },
                data: { isPublic: true, publishedAt: new Date() },
                select: PUBLIC_SETTINGS_SELECT,
              });
            }
          }
          throw error;
        }
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not allocate a public URL. Please try again.",
      });
    }),

  /** Unpublish → the public URL 404s immediately. `publicId`/`publicSlug` are
   * kept so republishing revives previously shared links (ADR-0038). */
  unpublish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");
      return ctx.db.knowledgePage.update({
        where: { id: input.id },
        data: { isPublic: false },
        select: PUBLIC_SETTINGS_SELECT,
      });
    }),

  /** Edit the cosmetic slug and/or the search-engine opt-in. The slug is
   * re-slugified server-side, so any input collapses to a valid URL segment;
   * old URLs keep working via the canonical redirect (lookup is by `publicId`). */
  updatePublicSettings: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        publicSlug: boundedText("Slug", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        publicSeoIndexed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");
      return ctx.db.knowledgePage.update({
        where: { id: input.id },
        data: {
          ...(input.publicSlug !== undefined
            ? { publicSlug: slugifyPageTitle(input.publicSlug) }
            : {}),
          ...(input.publicSeoIndexed !== undefined
            ? { publicSeoIndexed: input.publicSeoIndexed }
            : {}),
        },
        select: PUBLIC_SETTINGS_SELECT,
      });
    }),

  /**
   * Duplicate a Page: view access on the source + the same placement gate as
   * create (so the copy lands with identical visibility — same project /
   * workspace, per ADR-0038). Copies content and the search toggle; the copy
   * is owned by the duplicator and never inherits publish state.
   */
  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");
      await assertCanPlacePage(ctx.db, userId, page.workspaceId, page.projectId);

      const source = await ctx.db.knowledgePage.findUniqueOrThrow({
        where: { id: input.id },
        select: {
          title: true,
          body: true,
          bodyDoc: true,
          includeInSearch: true,
          workspaceId: true,
          projectId: true,
        },
      });

      const copy = await ctx.db.knowledgePage.create({
        data: {
          title: `${source.title} (copy)`,
          body: source.body,
          bodyDoc:
            source.bodyDoc === null
              ? undefined
              : (source.bodyDoc as Prisma.InputJsonValue),
          includeInSearch: source.includeInSearch,
          workspaceId: source.workspaceId,
          projectId: source.projectId,
          createdById: userId,
        },
      });

      // Index the copied body like create does for seeded bodies.
      if (source.body?.trim()) {
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(copy.id);
      }
      return copy;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");
      await ctx.db.knowledgePage.delete({ where: { id: input.id } });
      // Drop the Page's chunks from the Knowledge index so search can't return
      // a deleted page.
      await getEmbeddingTriggerService(ctx.db).clearPageChunks(input.id);
      return { success: true };
    }),
});
