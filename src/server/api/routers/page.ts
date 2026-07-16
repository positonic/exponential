import { z } from "zod";
import { randomInt } from "crypto";
import type { JSONContent } from "@tiptap/core";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  slugifyPageTitle,
} from "~/lib/pages/public-url";
import {
  collectPageLinkIds,
  remapPageLinkIds,
  type PageLinkRewrite,
} from "~/lib/pages/public-doc";
import { buildPageEditorPath } from "~/lib/pages/page-path";
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

/** Everything duplicate-with-sub-pages copies per page (+ access fields). */
const DUPLICATE_SELECT = {
  id: true,
  title: true,
  body: true,
  bodyDoc: true,
  includeInSearch: true,
  workspaceId: true,
  projectId: true,
  createdById: true,
} satisfies Prisma.KnowledgePageSelect;

type DuplicateRow = Prisma.KnowledgePageGetPayload<{
  select: typeof DUPLICATE_SELECT;
}>;

/** Load the access-relevant slice of a Page (shared with the pageComment router). */
export async function loadPageForAccess(db: PrismaClient, id: string) {
  const page = await db.knowledgePage.findUnique({
    where: { id },
    select: PAGE_ACCESS_SELECT,
  });
  if (!page) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
  }
  return page;
}

/** Throw unless the user has view/edit access (shared with the pageComment router). */
export async function ensurePageAccess(
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

/** Non-throwing {@link assertCanPlacePage} — for bulk paths (duplicate-with-
 * sub-pages) that skip un-placeable pages instead of failing the whole op. */
async function canPlacePage(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  projectId: string | null | undefined,
): Promise<boolean> {
  try {
    await assertCanPlacePage(db, userId, workspaceId, projectId);
    return true;
  } catch {
    return false;
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

/**
 * The publish core (ADR-0038), shared by `publish` and `publishMany`. Callers
 * must have already enforced edit access. First publish mints the immutable
 * `publicId` and derives `publicSlug` from the title; republish reuses both,
 * reviving old links.
 */
async function publishPage(db: PrismaClient, id: string) {
  const existing = await db.knowledgePage.findUniqueOrThrow({
    where: { id },
    select: { title: true, publicId: true, publicSlug: true },
  });

  const publicSlug = existing.publicSlug ?? slugifyPageTitle(existing.title);

  if (existing.publicId) {
    return db.knowledgePage.update({
      where: { id },
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
      return await db.knowledgePage.update({
        where: { id, AND: [{ publicId: null }] },
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
          return db.knowledgePage.update({
            where: { id },
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
}

/** Cap on the pageLink graph walk — keeps a pathological/cyclic doc bounded. */
const LINKED_PAGES_LIMIT = 50;

/**
 * Walk the `pageLink` graph from a root page (BFS, cycle-safe, capped at
 * {@link LINKED_PAGES_LIMIT}), returning the distinct reachable pages.
 * Constrained to the root's workspace: `/page` only ever creates same-workspace
 * links, and a pasted cross-workspace id must not leak another workspace's
 * titles through this query.
 */
async function collectLinkedPages(
  db: PrismaClient,
  root: { id: string; workspaceId: string },
  rootDoc: JSONContent | null,
) {
  const visited = new Set<string>([root.id]);
  const linked: {
    id: string;
    title: string;
    isPublic: boolean;
    createdById: string;
    projectId: string | null;
    workspaceId: string;
  }[] = [];
  let frontier = collectPageLinkIds(rootDoc).filter((id) => !visited.has(id));

  while (frontier.length > 0 && visited.size <= LINKED_PAGES_LIMIT) {
    frontier.forEach((id) => visited.add(id));
    const pages = await db.knowledgePage.findMany({
      where: { id: { in: frontier }, workspaceId: root.workspaceId },
      select: {
        id: true,
        title: true,
        isPublic: true,
        bodyDoc: true,
        createdById: true,
        projectId: true,
        workspaceId: true,
      },
    });
    const next: string[] = [];
    for (const page of pages) {
      const { bodyDoc, ...rest } = page;
      linked.push(rest);
      next.push(
        ...collectPageLinkIds(bodyDoc as JSONContent | null).filter(
          (id) => !visited.has(id),
        ),
      );
    }
    frontier = [...new Set(next)];
  }
  return linked;
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

  /**
   * The workspace's pages arranged as a nesting tree (ADR-0039). Nesting is the
   * `pageLink` graph: a child is a page linked from another page's body. Builds
   * the adjacency over the caller's *viewable* pages only (same access `where`
   * as {@link list}), picks one canonical parent per child — the newest-edited
   * linker, matching `parentCrumb` — and returns a depth-flattened, display-
   * ordered list (roots newest-first, children in the parent's document order).
   * Cycle- and multi-parent-safe: every viewable page appears exactly once.
   */
  tree: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().optional(),
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

      const pages = await ctx.db.knowledgePage.findMany({
        where: { AND: filters },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          projectId: true,
          isPublic: true,
          updatedAt: true,
          bodyDoc: true,
          project: { select: { id: true, name: true } },
        },
      });

      type Row = Omit<(typeof pages)[number], "bodyDoc">;
      const rowById = new Map<string, Row>();
      // Child ids per page, restricted to viewable pages in this set and in the
      // page's document order.
      const childIdsOf = new Map<string, string[]>();
      const inSet = new Set(pages.map((p) => p.id));
      for (const page of pages) {
        const { bodyDoc, ...row } = page;
        rowById.set(page.id, row);
        childIdsOf.set(
          page.id,
          collectPageLinkIds(bodyDoc as JSONContent | null).filter((id) =>
            inSet.has(id),
          ),
        );
      }

      // Canonical parent per child = the newest-edited page that links it.
      // `pages` is already newest-first, so the first linker we see wins.
      const parentOf = new Map<string, string>();
      for (const page of pages) {
        for (const childId of childIdsOf.get(page.id) ?? []) {
          if (childId === page.id) continue; // ignore self-links
          if (!parentOf.has(childId)) parentOf.set(childId, page.id);
        }
      }

      const flat: (Row & { depth: number; hasChildren: boolean })[] = [];
      const visited = new Set<string>();
      const visit = (id: string, depth: number) => {
        if (visited.has(id)) return; // cycle / multi-parent guard
        visited.add(id);
        const row = rowById.get(id);
        if (!row) return;
        const children = (childIdsOf.get(id) ?? []).filter(
          (childId) => parentOf.get(childId) === id && !visited.has(childId),
        );
        flat.push({ ...row, depth, hasChildren: children.length > 0 });
        for (const childId of children) visit(childId, depth + 1);
      };

      // Roots: pages nothing viewable links to, newest-first (order preserved).
      for (const page of pages) {
        if (!parentOf.has(page.id)) visit(page.id, 0);
      }
      // Any page still unvisited sits in a link cycle with no external root —
      // surface it as a root so the tree never silently drops a page.
      for (const page of pages) {
        if (!visited.has(page.id)) visit(page.id, 0);
      }

      return flat;
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

  /**
   * The "parent" of a page for breadcrumbs: a page whose body links to this
   * one via a `pageLink` node. Sub-pages are soft — there is no stored parent
   * pointer (ADR-0033/0038) — so this is a reverse lookup: scan same-workspace
   * pages whose serialized `bodyDoc` mentions this id (cheap `::text` LIKE
   * pre-filter), then confirm with {@link collectPageLinkIds} to reject
   * incidental text matches, and gate on the caller's view access. A page can
   * have several linkers; the newest-edited viewable one wins. Returns null
   * when the page is top-level or has no viewable linker.
   */
  parentCrumb: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");

      // Escape LIKE wildcards (`%` `_` `\`) so a pathological id can't broaden
      // the pre-filter into a full-workspace scan. Postgres LIKE treats `\` as
      // the escape char by default, so `\%`/`\_`/`\\` match those literals.
      // (Titles still can't leak: every candidate is view-gated below.)
      const likePattern = `%${input.id.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await ctx.db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "KnowledgePage"
        WHERE "workspaceId" = ${page.workspaceId}
          AND "id" <> ${input.id}
          AND "bodyDoc"::text LIKE ${likePattern}
        ORDER BY "updatedAt" DESC
        LIMIT 20
      `;
      if (rows.length === 0) return null;

      const candidates = await ctx.db.knowledgePage.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: {
          id: true,
          title: true,
          bodyDoc: true,
          createdById: true,
          projectId: true,
          workspaceId: true,
        },
      });
      const byId = new Map(candidates.map((c) => [c.id, c]));

      // Preserve the raw query's newest-edited-first order.
      for (const { id } of rows) {
        const candidate = byId.get(id);
        if (!candidate) continue;
        const links = collectPageLinkIds(candidate.bodyDoc as JSONContent | null);
        if (!links.includes(input.id)) continue;
        const access = await getKnowledgePageAccess(ctx.db, userId, candidate);
        if (canViewKnowledgePage(access)) {
          return { id: candidate.id, title: candidate.title };
        }
      }
      return null;
    }),

  /**
   * The sub-pages of a page: the `pageLink` targets in its own `bodyDoc`
   * (ADR-0039 — nesting is the link graph, so a child is literally a link in
   * the parent's body), resolved to live `{id, title, isPublic}` in document
   * order and filtered to the ones the caller can view. Cheap: no reverse scan
   * — the children are already named in the body we just loaded.
   */
  children: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");

      const self = await ctx.db.knowledgePage.findUniqueOrThrow({
        where: { id: input.id },
        select: { bodyDoc: true },
      });
      const ids = collectPageLinkIds(self.bodyDoc as JSONContent | null);
      if (ids.length === 0) return [];

      // Same-workspace only: a pasted cross-workspace id must not surface
      // another workspace's title (mirrors collectLinkedPages / parentCrumb).
      // Push the view-access filter into the query (buildKnowledgePageAccessWhere
      // mirrors getKnowledgePageAccess) so one round-trip returns exactly the
      // viewable candidates — no per-child access resolution.
      const candidates = await ctx.db.knowledgePage.findMany({
        where: {
          id: { in: ids },
          workspaceId: page.workspaceId,
          ...buildKnowledgePageAccessWhere(userId),
        },
        select: { id: true, title: true, isPublic: true },
      });
      const byId = new Map(candidates.map((c) => [c.id, c]));

      // Re-emit in document order (the order of `ids`), viewable ones only.
      const children: { id: string; title: string; isPublic: boolean }[] = [];
      for (const id of ids) {
        const candidate = byId.get(id);
        if (candidate) children.push(candidate);
      }
      return children;
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
      return publishPage(ctx.db, input.id);
    }),

  /**
   * The pages this page links to (via `pageLink` nodes, transitively) that are
   * not yet published and that the caller could publish. The share popover
   * lists them so publishing a sub-tree stays an explicit, visible act —
   * ADR-0038's "publishing never follows from visibility rules" holds; this
   * only extends the consent surface.
   */
  linkedUnpublished: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");

      const root = await ctx.db.knowledgePage.findUniqueOrThrow({
        where: { id: input.id },
        select: { bodyDoc: true },
      });
      const linked = await collectLinkedPages(
        ctx.db,
        page,
        root.bodyDoc as JSONContent | null,
      );

      const publishable: { id: string; title: string }[] = [];
      for (const candidate of linked) {
        if (candidate.isPublic) continue;
        const access = await getKnowledgePageAccess(ctx.db, userId, candidate);
        if (canEditKnowledgePage(access)) {
          publishable.push({ id: candidate.id, title: candidate.title });
        }
      }
      return publishable;
    }),

  /**
   * Publish several pages at once — the share popover's "publish linked pages"
   * action (typically the ids returned by `linkedUnpublished`). Each page is
   * gated by the same edit check as `publish`; ids are explicit so the server
   * never publishes anything the user didn't see listed.
   */
  publishMany: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(LINKED_PAGES_LIMIT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ids = [...new Set(input.ids)];
      // Pre-flight: require edit access on *every* page before publishing any,
      // so "you can't publish X" rejects the whole request up front instead of
      // after publishing some of the batch. This is not a transaction —
      // publishPage's mint-collision retry must survive a unique violation,
      // which would abort a Postgres tx — so a rare failure mid-loop leaves a
      // partial batch. That's safe: publishing is idempotent, so the caller can
      // simply retry. (The permission window between check and publish is
      // sub-second and low-impact: at worst a page the user could edit moments
      // ago gets published.)
      for (const id of ids) {
        const page = await loadPageForAccess(ctx.db, id);
        await ensurePageAccess(ctx.db, userId, page, "edit");
      }
      const results = [];
      for (const id of ids) {
        results.push(await publishPage(ctx.db, id));
      }
      return results;
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
   *
   * With `withSubpages`, the whole sub-tree is copied (ADR-0039): BFS the
   * `pageLink` graph (workspace-scoped, cycle-safe, capped at
   * {@link LINKED_PAGES_LIMIT}), deep-copy the reachable pages the caller can
   * both view and place, remap old→new ids, and rewrite the copied bodies'
   * `pageLink` targets so the copy links to the copies. Links to pages that
   * can't be copied (no access, or beyond the cap) keep pointing at the
   * originals. Only the root is titled "(copy)"; sub-pages keep their names.
   */
  duplicate: protectedProcedure
    .input(z.object({ id: z.string(), withSubpages: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");
      await assertCanPlacePage(ctx.db, userId, page.workspaceId, page.projectId);

      const workspace = await ctx.db.workspace.findUniqueOrThrow({
        where: { id: page.workspaceId },
        select: { slug: true },
      });

      // The set of pages to copy: the root, plus (when requested) the reachable
      // sub-tree the caller can view AND place. Order the root first so it gets
      // the "(copy)" title and is returned as the entry point.
      const rootRow = await ctx.db.knowledgePage.findUniqueOrThrow({
        where: { id: input.id },
        select: DUPLICATE_SELECT,
      });
      const toCopy: DuplicateRow[] = [rootRow];

      if (input.withSubpages) {
        const linked = await collectLinkedPages(
          ctx.db,
          page,
          rootRow.bodyDoc as JSONContent | null,
        );
        const extraIds = linked.map((l) => l.id).filter((id) => id !== input.id);
        // Filter to viewable rows in the query (buildKnowledgePageAccessWhere
        // mirrors getKnowledgePageAccess) rather than resolving access per row.
        const rows =
          extraIds.length > 0
            ? await ctx.db.knowledgePage.findMany({
                where: {
                  id: { in: extraIds },
                  ...buildKnowledgePageAccessWhere(userId),
                },
                select: DUPLICATE_SELECT,
              })
            : [];
        const rowById = new Map(rows.map((r) => [r.id, r]));
        // Memoize the placement gate per (workspace, project) — sub-pages of a
        // tree overwhelmingly share one, collapsing the check to ~one round-trip.
        const placeable = new Map<string, boolean>();
        // Iterate extraIds (not rows) to preserve BFS/document order.
        for (const id of extraIds) {
          const row = rowById.get(id);
          if (!row) continue;
          const placeKey = `${row.workspaceId}:${row.projectId ?? ""}`;
          let canPlace = placeable.get(placeKey);
          if (canPlace === undefined) {
            canPlace = await canPlacePage(
              ctx.db,
              userId,
              row.workspaceId,
              row.projectId,
            );
            placeable.set(placeKey, canPlace);
          }
          if (canPlace) toCopy.push(row);
        }
      }

      // Two passes in one transaction: create every copy (to mint ids and build
      // the old→new remap), then rewrite each copied body's `pageLink` targets.
      const copies = await ctx.db.$transaction(async (tx) => {
        const remap = new Map<string, PageLinkRewrite>();
        const created: { source: DuplicateRow; id: string }[] = [];
        for (const [index, row] of toCopy.entries()) {
          const created0 = await tx.knowledgePage.create({
            data: {
              title: index === 0 ? `${row.title} (copy)` : row.title,
              body: row.body,
              bodyDoc:
                row.bodyDoc === null
                  ? undefined
                  : (row.bodyDoc as Prisma.InputJsonValue),
              includeInSearch: row.includeInSearch,
              workspaceId: row.workspaceId,
              projectId: row.projectId,
              createdById: userId,
            },
            select: { id: true },
          });
          remap.set(row.id, {
            pageId: created0.id,
            href: buildPageEditorPath(workspace.slug, created0.id),
          });
          created.push({ source: row, id: created0.id });
        }

        // Rewrite links only for copies whose body actually links a copied
        // page — skip the no-op writes.
        for (const { source, id } of created) {
          if (source.bodyDoc === null) continue;
          const doc = source.bodyDoc as JSONContent;
          if (!collectPageLinkIds(doc).some((linkId) => remap.has(linkId))) {
            continue;
          }
          await tx.knowledgePage.update({
            where: { id },
            data: { bodyDoc: remapPageLinkIds(doc, remap) as Prisma.InputJsonValue },
          });
        }
        return created;
      });

      // Index every copied body like create does for seeded bodies.
      for (const { source, id } of copies) {
        if (source.body?.trim()) {
          getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(id);
        }
      }
      // The root copy is the entry point the client navigates to. `toCopy`
      // always leads with `rootRow`, so `copies` is never empty — guard anyway
      // so a partial transaction surfaces a clear error instead of a crash.
      const rootCopy = copies[0];
      if (!rootCopy) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Duplicate produced no pages",
        });
      }
      return { id: rootCopy.id };
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
