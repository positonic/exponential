/**
 * Relation edges (ADR-0078 §5): writing a relation cell replaces the row's
 * edges under that property in `DatabaseRelation`, and — for a two-way
 * database relation — keeps the reverse column's edges on the other side in
 * step, in the same transaction. Reading resolves each edge to what its
 * target is called now.
 *
 * Only `ROW` targets are written here so far; the native kinds (Ticket,
 * Project, Feature, Goal, Key result, Page) are read-only references that
 * arrive with their own resolution.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { newPropertyId, parseProperties, type PropertyDef } from "~/lib/databases/schema";
import {
  inverseProperty,
  reversePropertyName,
  type RelationTarget,
  type RowRelations,
} from "~/lib/databases/relations";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { PropertyValueError } from "./values";

type Db = PrismaClient | Prisma.TransactionClient;

/** The reverse column a two-way relation puts on the target database. */
export function reversePropertyFor(
  source: { id: string; name: string },
  forward: PropertyDef,
  targetProperties: readonly PropertyDef[],
): PropertyDef {
  return {
    id: newPropertyId(),
    name: reversePropertyName(source.name, targetProperties),
    type: "relation",
    relation: {
      targetKind: "ROW",
      targetDatabaseId: source.id,
      inverseOf: { databaseId: source.id, propertyId: forward.id },
      many: true,
    },
  };
}

function refuse(def: PropertyDef, reason: string): never {
  throw new PropertyValueError({ propertyId: def.id, propertyName: def.name, reason });
}

export interface ReplaceRowRelationsInput {
  databaseId: string;
  rowId: string;
  def: PropertyDef;
  /** The row's new targets, in order; empty clears the cell. */
  targetIds: string[];
}

/**
 * Set a row's targets under one relation property: its edges are replaced,
 * and the inverse edges on the related database's reverse column (if it has
 * one) are rewritten to match. Targets must be rows of the related database.
 */
export async function replaceRowRelations(
  tx: Db,
  { databaseId, rowId, def, targetIds }: ReplaceRowRelationsInput,
): Promise<void> {
  const rel = def.relation;
  if (!rel) refuse(def, "has no relation target");
  if (rel.targetKind !== "ROW" || !rel.targetDatabaseId) {
    refuse(def, `relates to a ${rel.targetKind.toLowerCase()}, which cannot be set yet`);
  }
  const targetDatabaseId = rel.targetDatabaseId;
  const ids = [...new Set(targetIds)];
  if (!rel.many && ids.length > 1) refuse(def, "takes one target");

  if (ids.length > 0) {
    const found = await tx.knowledgePage.findMany({
      where: { id: { in: ids }, databaseId: targetDatabaseId },
      select: { id: true },
    });
    const present = new Set(found.map((r) => r.id));
    const missing = ids.find((id) => !present.has(id));
    if (missing) refuse(def, `names a row that is not in the related database: "${missing}"`);
  }

  await tx.databaseRelation.deleteMany({ where: { rowPageId: rowId, propertyId: def.id } });
  if (ids.length > 0) {
    await tx.databaseRelation.createMany({
      data: ids.map((id, position) => ({
        databaseId,
        propertyId: def.id,
        rowPageId: rowId,
        targetKind: "ROW" as const,
        targetId: id,
        targetRowPageId: id,
        position,
      })),
    });
  }

  // The other side: drop every inverse edge that pointed at this row, then
  // add one on each new target, after whatever it already relates to.
  const target = await tx.pageDatabase.findUnique({
    where: { id: targetDatabaseId },
    select: { id: true, properties: true },
  });
  if (!target) return;
  const inverse = inverseProperty(def, databaseId, parseProperties(target.properties));
  if (!inverse) return;
  await tx.databaseRelation.deleteMany({
    where: { databaseId: target.id, propertyId: inverse.id, targetRowPageId: rowId },
  });
  for (const id of ids) {
    const position = await tx.databaseRelation.count({
      where: { rowPageId: id, propertyId: inverse.id },
    });
    await tx.databaseRelation.create({
      data: {
        databaseId: target.id,
        propertyId: inverse.id,
        rowPageId: id,
        targetKind: "ROW",
        targetId: rowId,
        targetRowPageId: rowId,
        position,
      },
    });
  }
}

interface EdgeRecord {
  rowPageId: string;
  propertyId: string;
  targetKind: RelationTarget["kind"];
  targetId: string;
  targetRowPage: { id: string; title: string } | null;
}

function resolveTarget(edge: EdgeRecord, workspaceSlug: string | null | undefined): RelationTarget {
  if (edge.targetKind === "ROW") {
    if (!edge.targetRowPage) {
      return { kind: "ROW", id: edge.targetId, title: "(deleted)", deleted: true };
    }
    return {
      kind: "ROW",
      id: edge.targetId,
      title: edge.targetRowPage.title || "Untitled",
      ...(workspaceSlug ? { href: buildPageEditorPath(workspaceSlug, edge.targetId) } : {}),
    };
  }
  // Native targets resolve to their live title and status in their own slice.
  return { kind: edge.targetKind, id: edge.targetId, title: edge.targetId };
}

/**
 * Every relation value of the given rows, resolved, keyed by row then by
 * property — one query for the page of rows. Rows get an empty list for each
 * relation property they have no edges under, so a cell is never undefined.
 * With no `workspaceSlug` (a public render) targets carry no `href`.
 */
export async function loadRowRelations(
  db: Db,
  rowIds: readonly string[],
  properties: readonly PropertyDef[],
  workspaceSlug?: string | null,
): Promise<Map<string, RowRelations>> {
  const relationProps = properties.filter((p) => p.type === "relation");
  const result = new Map<string, RowRelations>(
    rowIds.map((id) => [id, Object.fromEntries(relationProps.map((p) => [p.id, []]))]),
  );
  if (relationProps.length === 0 || rowIds.length === 0) return result;

  const edges = await db.databaseRelation.findMany({
    where: { rowPageId: { in: [...rowIds] }, propertyId: { in: relationProps.map((p) => p.id) } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      rowPageId: true,
      propertyId: true,
      targetKind: true,
      targetId: true,
      targetRowPage: { select: { id: true, title: true } },
    },
  });
  for (const edge of edges) {
    const row = result.get(edge.rowPageId);
    if (!row) continue;
    (row[edge.propertyId] ??= []).push(resolveTarget(edge, workspaceSlug));
  }
  return result;
}

/** The relation cells of rows that have them, as Markdown: `[title](href)` per target, comma-separated. */
export function relationMarkdown(targets: readonly RelationTarget[] | undefined): string {
  if (!targets || targets.length === 0) return "";
  return targets
    .map((t) => {
      const title = t.title.replace(/([[\]])/g, "\\$1");
      return t.href && !t.deleted ? `[${title}](${t.href})` : title;
    })
    .join(", ");
}
