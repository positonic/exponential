import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { databaseMarker } from "~/lib/databases/marker";
import {
  defaultTitleProperty,
  emptyView,
  parseProperties,
  parseView,
} from "~/lib/databases/schema";
import {
  ensurePageAccess,
  PAGE_ACCESS_SELECT,
} from "~/server/services/pages/access";
import { recordPageRevision } from "~/server/services/pages/revisions";
import { rowValues } from "~/server/services/databases/projection";
import {
  coerceRowValues,
  PropertyValueError,
} from "~/server/services/databases/values";

/**
 * Databases (ADR-0078): the typed write path for a Database and its Rows.
 * Every procedure resolves access through the **holding page** — a database
 * and its rows have none of their own (§4) — and every write that touches a
 * row's values goes through the property-type registry, so nothing untyped
 * ever lands in `KnowledgePage.properties` (§7). The UI, CLI, MCP and imports
 * all come through here; `page.*` never writes a row's values.
 */

/** A database with the slice of its holding page the access resolver and row creation need. */
const DATABASE_SELECT = {
  id: true,
  pageId: true,
  workspaceId: true,
  name: true,
  properties: true,
  view: true,
  titlePropertyId: true,
  detachedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  page: {
    select: { ...PAGE_ACCESS_SELECT, title: true, includeInSearch: true },
  },
} satisfies Prisma.PageDatabaseSelect;

type DatabaseRow = Prisma.PageDatabaseGetPayload<{ select: typeof DATABASE_SELECT }>;

/** Everything a row read returns: the page's identity plus its typed values. */
const ROW_SELECT = {
  id: true,
  title: true,
  databaseId: true,
  properties: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KnowledgePageSelect;

type RowRecord = Prisma.KnowledgePageGetPayload<{ select: typeof ROW_SELECT }>;

async function loadDatabase(db: PrismaClient, id: string): Promise<DatabaseRow> {
  const database = await db.pageDatabase.findUnique({
    where: { id },
    select: DATABASE_SELECT,
  });
  if (!database) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Database not found" });
  }
  return database;
}

/** The database as callers see it: parsed definitions, the holding page named. */
function presentDatabase(database: DatabaseRow) {
  const { page, properties, view, ...rest } = database;
  return {
    ...rest,
    properties: parseProperties(properties),
    view: parseView(view),
    page: { id: page.id, title: page.title },
  };
}

function presentRow(row: RowRecord) {
  const { properties, ...rest } = row;
  return { ...rest, values: rowValues(properties) };
}

/** A typed rejection → BAD_REQUEST naming the property; anything else passes through. */
function asTRPCError(error: unknown): never {
  if (error instanceof PropertyValueError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
  }
  throw error;
}

const rowValuesInput = z.record(z.string().min(1), z.unknown());

export const databaseRouter = createTRPCRouter({
  /**
   * Create a database on a page, with a title property. The caller then puts
   * the block in the body: the editor inserts the `database` node, the CLI
   * appends `marker` to the Markdown body through `page.update`.
   */
  create: protectedProcedure
    .input(
      z.object({
        pageId: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await ctx.db.knowledgePage.findUnique({
        where: { id: input.pageId },
        select: { ...PAGE_ACCESS_SELECT, databaseId: true },
      });
      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }
      await ensurePageAccess(ctx.db, userId, page, "edit");
      if (page.databaseId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A row page cannot hold a database",
        });
      }

      const title = defaultTitleProperty();
      const created = await ctx.db.pageDatabase.create({
        data: {
          pageId: page.id,
          workspaceId: page.workspaceId,
          name: input.name.trim(),
          properties: [title] as unknown as Prisma.InputJsonValue,
          view: emptyView([title.id]) as unknown as Prisma.InputJsonValue,
          titlePropertyId: title.id,
          createdById: userId,
        },
        select: DATABASE_SELECT,
      });
      return { ...presentDatabase(created), marker: databaseMarker(created.id) };
    }),

  /** One database: its definition, view, row count and holding page. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "view");
      const rowCount = await ctx.db.knowledgePage.count({
        where: { databaseId: database.id },
      });
      return { ...presentDatabase(database), rowCount, marker: databaseMarker(database.id) };
    }),

  /**
   * Add a Row: a page belonging to the database, placed where its holding
   * page is (same workspace, project and search inclusion — copied, as
   * duplicate does), with `values` checked against the schema. Keys are
   * property ids or names; the title property becomes the page title.
   */
  createRow: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        values: rowValuesInput.default({}),
        /** Why the row was added — stored on its first revision (ADR-0074). */
        note: boundedText("Note", TEXT_LIMITS.SHORT).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, database.page, "edit");

      const properties = parseProperties(database.properties);
      let coerced;
      try {
        coerced = coerceRowValues(properties, input.values);
      } catch (error) {
        asTRPCError(error);
      }
      const { values, title } = coerced;

      const row = await ctx.db.$transaction(async (tx) => {
        const created = await tx.knowledgePage.create({
          data: {
            title: title?.trim() ? title.trim() : "Untitled",
            databaseId: database.id,
            properties: values,
            workspaceId: database.page.workspaceId,
            projectId: database.page.projectId,
            includeInSearch: database.page.includeInSearch,
            createdById: userId,
          },
          select: ROW_SELECT,
        });
        await recordPageRevision(tx, {
          pageId: created.id,
          kind: "create",
          authorId: userId,
          note: input.note,
        });
        return created;
      });
      return presentRow(row);
    }),

  /**
   * The database's rows with their typed values, oldest first, paged by
   * cursor. The saved view's sort, filters and hidden columns apply from the
   * query compiler in the next slice.
   */
  listRows: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "view");
      const rows = await ctx.db.knowledgePage.findMany({
        where: { databaseId: database.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: ROW_SELECT,
      });
      const hasMore = rows.length > input.limit;
      const slice = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        rows: slice.map(presentRow),
        nextCursor: hasMore ? slice[slice.length - 1]!.id : null,
      };
    }),
});
