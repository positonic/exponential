import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { databaseMarker } from "~/lib/databases/marker";
import {
  ADDABLE_PROPERTY_TYPES,
  databaseViewSchema,
  defaultTitleProperty,
  emptyView,
  findProperty,
  hasOptions,
  newPropertyId,
  normaliseOptions,
  parseProperties,
  parseView,
  pillColorSchema,
  propertyTypeSchema,
  unknownPropertyInView,
  visibleProperties,
  type DatabaseView,
  type PillColor,
  type PropertyDef,
  type PropertyType,
} from "~/lib/databases/schema";
import {
  ensurePageAccess,
  PAGE_ACCESS_SELECT,
} from "~/server/services/pages/access";
import { recordPageRevision } from "~/server/services/pages/revisions";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
import { rowValues } from "~/server/services/databases/projection";
import {
  compileRowQuery,
  cursorFromOffset,
  offsetFromCursor,
  RowQueryError,
  type RowQueryRecord,
} from "~/server/services/databases/query";
import {
  coerceRowValues,
  PropertyValueError,
} from "~/server/services/databases/values";
import type { PropertyValue } from "~/lib/databases/properties";

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
  if (error instanceof PropertyValueError || error instanceof RowQueryError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
  }
  throw error;
}

/** A view to save or query with: every property it names must exist. */
function assertViewResolves(properties: readonly PropertyDef[], view: DatabaseView): void {
  const unknown = unknownPropertyInView(properties, view);
  if (unknown !== null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The view names a property this database does not have: "${unknown}"`,
    });
  }
}

const rowValuesInput = z.record(z.string().min(1), z.unknown());

/** A type a caller may add or change a property to (never title, never relation — V3). */
const addableTypeInput = propertyTypeSchema.refine(
  (type): type is PropertyType => ADDABLE_PROPERTY_TYPES.includes(type),
  { message: "A property cannot be given this type here" },
);

const optionInput = z.object({
  /** Present when renaming or recolouring an existing option; absent for a new one. */
  id: z.string().optional(),
  name: boundedText("Option", TEXT_LIMITS.LABEL, { min: 1 }),
  color: pillColorSchema.optional(),
});

/**
 * Persist a changed definition and/or view. The only writer of those two
 * columns, so every change passes through the same JSON shapes.
 */
async function writeDefinition(
  db: PrismaClient,
  id: string,
  data: { properties?: PropertyDef[]; view?: DatabaseView },
): Promise<DatabaseRow> {
  return db.pageDatabase.update({
    where: { id },
    data: {
      ...(data.properties
        ? { properties: data.properties as unknown as Prisma.InputJsonValue }
        : {}),
      ...(data.view ? { view: data.view as unknown as Prisma.InputJsonValue } : {}),
    },
    select: DATABASE_SELECT,
  });
}

function assertUniquePropertyName(
  properties: readonly PropertyDef[],
  name: string,
  exceptId?: string,
): void {
  const wanted = name.trim().toLowerCase();
  const clash = properties.find(
    (p) => p.id !== exceptId && p.name.trim().toLowerCase() === wanted,
  );
  if (clash) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A property named "${clash.name}" already exists`,
    });
  }
}

function normaliseOptionsOrThrow(
  input: readonly { id?: string; name: string; color?: PillColor }[],
  existing: PropertyDef["options"],
) {
  const { options, duplicateName } = normaliseOptions(input, existing ?? []);
  if (duplicateName !== undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Option "${duplicateName}" is listed twice`,
    });
  }
  return options;
}

/** A Row with its database — the slice `updateRow` / `deleteRow` need. */
const ROW_FOR_WRITE_SELECT = {
  ...ROW_SELECT,
  database: { select: DATABASE_SELECT },
} satisfies Prisma.KnowledgePageSelect;

async function loadRowForWrite(db: PrismaClient, rowId: string) {
  const row = await db.knowledgePage.findUnique({
    where: { id: rowId },
    select: ROW_FOR_WRITE_SELECT,
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
  if (!row.database) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This page is not a row of a database" });
  }
  return { ...row, database: row.database };
}

/** The property a caller named, or NOT_FOUND. */
function requireProperty(properties: readonly PropertyDef[], key: string): PropertyDef {
  const def = findProperty(properties, key);
  if (!def) {
    throw new TRPCError({ code: "NOT_FOUND", message: `No property "${key}" on this database` });
  }
  return def;
}

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
   * Write some of a Row's values. Keys are property ids or names; a value
   * checked by the registry replaces the cell, `null` clears it, and cells
   * not named are kept — minus any under a property that no longer exists,
   * which this write finally drops. Records a `properties` revision on the
   * row page (ADR-0074): from the table block it folds into the editor's
   * session; from the CLI, MCP or an agent it is its own row.
   */
  updateRow: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        values: rowValuesInput,
        note: boundedText("Note", TEXT_LIMITS.SHORT).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const row = await loadRowForWrite(ctx.db, input.rowId);
      await ensurePageAccess(ctx.db, userId, row.database.page, "edit");

      const properties = parseProperties(row.database.properties);
      let coerced;
      try {
        coerced = coerceRowValues(properties, input.values);
      } catch (error) {
        asTRPCError(error);
      }
      const { values, title } = coerced;
      const known = new Set(properties.map((p) => p.id));
      const merged: Record<string, PropertyValue | null> = {};
      for (const [id, value] of Object.entries(rowValues(row.properties))) {
        if (known.has(id) && value !== null) merged[id] = value;
      }
      for (const [id, value] of Object.entries(values)) {
        if (value === null) delete merged[id];
        else merged[id] = value;
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const written = await tx.knowledgePage.update({
          where: { id: row.id },
          data: {
            properties: merged,
            ...(title !== undefined ? { title: title.trim() ? title.trim() : "Untitled" } : {}),
          },
          select: ROW_SELECT,
        });
        await recordPageRevision(tx, {
          pageId: row.id,
          kind: "properties",
          authorId: userId,
          note: input.note,
          // A browser session is the table block; any token is a write from
          // outside the editor, which never folds (as `page.update` decides).
          fold: ctx.tokenType === undefined,
        });
        return written;
      });
      return presentRow(updated);
    }),

  /** Delete a Row — the page and its chunks in the Knowledge index. */
  deleteRow: protectedProcedure
    .input(z.object({ rowId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadRowForWrite(ctx.db, input.rowId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, row.database.page, "edit");
      await ctx.db.knowledgePage.delete({ where: { id: row.id } });
      await getEmbeddingTriggerService(ctx.db).clearPageChunks(row.id);
      return { id: row.id, databaseId: row.database.id };
    }),

  /**
   * The database's rows with their typed values through the saved view —
   * its sort and filters — or through `view`, a whole view the caller passes
   * instead (the table block while a filter is being tried; the CLI's
   * `--sort`/`--filter`). One statement from `compileRowQuery`; `cursor`
   * continues a page. `columns` is the visible property ids in view order;
   * rows still carry every value, hidden ones included, so un-hiding a
   * column needs no refetch.
   */
  listRows: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        view: databaseViewSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "view");
      const properties = parseProperties(database.properties);
      const view = input.view ?? parseView(database.view);
      if (input.view) assertViewResolves(properties, input.view);

      let rows: RowQueryRecord[];
      let offset: number;
      try {
        offset = offsetFromCursor(input.cursor);
        rows = await ctx.db.$queryRaw<RowQueryRecord[]>(
          compileRowQuery({
            databaseId: database.id,
            properties,
            view,
            limit: input.limit,
            offset,
          }),
        );
      } catch (error) {
        asTRPCError(error);
      }
      const hasMore = rows.length > input.limit;
      const slice = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        rows: slice.map(presentRow),
        nextCursor: hasMore ? cursorFromOffset(offset + input.limit) : null,
        columns: visibleProperties(properties, view).map((p) => p.id),
      };
    }),

  /**
   * Rename the database or replace its saved view — whole, never merged
   * (ADR-0078 §6: one view per block). A view that names a property the
   * database does not have is refused rather than trimmed.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        view: databaseViewSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "edit");
      if (input.view) {
        assertViewResolves(parseProperties(database.properties), input.view);
      }
      const updated = await ctx.db.pageDatabase.update({
        where: { id: database.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.view ? { view: input.view as unknown as Prisma.InputJsonValue } : {}),
        },
        select: DATABASE_SELECT,
      });
      return presentDatabase(updated);
    }),

  /**
   * Add a property. Select options get stable ids and palette colours; the
   * new column goes last in the saved view. `title` exists once from
   * creation and `relation` arrives with its own path (V3), so neither can
   * be added here.
   */
  addProperty: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }),
        type: addableTypeInput,
        description: boundedText("Description", TEXT_LIMITS.SHORT).optional(),
        options: optionInput.array().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "edit");
      const properties = parseProperties(database.properties);
      const view = parseView(database.view);

      assertUniquePropertyName(properties, input.name);
      if (input.options && !hasOptions(input.type)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Options apply to select and multiSelect properties only",
        });
      }
      const def: PropertyDef = {
        id: newPropertyId(),
        name: input.name.trim(),
        type: input.type,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(hasOptions(input.type)
          ? { options: normaliseOptionsOrThrow(input.options ?? [], []) }
          : {}),
      };
      const updated = await writeDefinition(ctx.db, database.id, {
        properties: [...properties, def],
        // An explicit column order grows by the new column; an empty order
        // keeps following definition order.
        view: view.propertyOrder.length
          ? { ...view, propertyOrder: [...view.propertyOrder, def.id] }
          : view,
      });
      return { property: def, database: presentDatabase(updated) };
    }),

  /**
   * Rename, describe, retype or re-option a property. Touches the definition
   * only — never a row: a renamed property or option keeps its id, so every
   * stored value still resolves. A property is named by id or by name.
   */
  updateProperty: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        propertyId: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        /** Null clears the description. */
        description: boundedText("Description", TEXT_LIMITS.SHORT).nullish(),
        type: addableTypeInput.optional(),
        /** The full option list; an option left out is removed (rows keep the old id). */
        options: optionInput.array().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "edit");
      const properties = parseProperties(database.properties);
      const current = requireProperty(properties, input.propertyId);

      if (input.type !== undefined && input.type !== current.type) {
        if (current.type === "title" || current.type === "relation") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The ${current.type} property "${current.name}" keeps its type`,
          });
        }
      }
      const nextType = input.type ?? current.type;
      if (input.options && !hasOptions(nextType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Options apply to select and multiSelect properties only",
        });
      }
      if (input.name !== undefined) {
        assertUniquePropertyName(properties, input.name, current.id);
      }

      const next: PropertyDef = {
        ...current,
        name: input.name?.trim() ?? current.name,
        type: nextType,
      };
      if (input.description !== undefined) {
        if (input.description?.trim()) next.description = input.description.trim();
        else delete next.description;
      }
      if (hasOptions(nextType)) {
        next.options = input.options
          ? normaliseOptionsOrThrow(input.options, current.options)
          : (current.options ?? []);
      } else {
        delete next.options;
      }

      const updated = await writeDefinition(ctx.db, database.id, {
        properties: properties.map((p) => (p.id === current.id ? next : p)),
      });
      return { property: next, database: presentDatabase(updated) };
    }),

  /**
   * Remove a property from the schema and the view. Row values under its id
   * stay where they are — unreachable, and dropped on the next write to that
   * row — so a mistaken removal is undone by adding the id back. The title
   * property cannot be removed.
   */
  removeProperty: protectedProcedure
    .input(z.object({ id: z.string(), propertyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "edit");
      const properties = parseProperties(database.properties);
      const view = parseView(database.view);
      const def = requireProperty(properties, input.propertyId);
      if (def.type === "title" || def.id === database.titlePropertyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The title property cannot be removed",
        });
      }
      const updated = await writeDefinition(ctx.db, database.id, {
        properties: properties.filter((p) => p.id !== def.id),
        view: {
          ...view,
          sort: view.sort?.propertyId === def.id ? undefined : view.sort,
          filters: view.filters.filter((f) => f.propertyId !== def.id),
          hiddenPropertyIds: view.hiddenPropertyIds.filter((id) => id !== def.id),
          propertyOrder: view.propertyOrder.filter((id) => id !== def.id),
        },
      });
      return presentDatabase(updated);
    }),

  /** Set the definition order — and the view's column order — to `propertyIds`, which must name every property once. */
  reorderProperties: protectedProcedure
    .input(z.object({ id: z.string(), propertyIds: z.string().array().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const database = await loadDatabase(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, database.page, "edit");
      const properties = parseProperties(database.properties);
      const view = parseView(database.view);

      const byId = new Map(properties.map((p) => [p.id, p]));
      const unique = new Set(input.propertyIds);
      const isPermutation =
        unique.size === input.propertyIds.length &&
        unique.size === properties.length &&
        input.propertyIds.every((id) => byId.has(id));
      if (!isPermutation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "propertyIds must list every property of the database exactly once",
        });
      }
      const updated = await writeDefinition(ctx.db, database.id, {
        properties: input.propertyIds.map((id) => byId.get(id)!),
        view: { ...view, propertyOrder: [...input.propertyIds] },
      });
      return presentDatabase(updated);
    }),
});
