/**
 * Relation edges (ADR-0078 §5): writing a relation cell replaces the row's
 * edges under that property in `DatabaseRelation`, and — for a two-way
 * database relation — keeps the reverse column's edges on the other side in
 * step, in the same transaction. Reading resolves each edge to what its
 * target is called now.
 *
 * Targets are rows of another database (`ROW`, two-way) or native entities
 * — Tickets, Projects, Features, Goals, Key results, Pages — which a
 * database reads and never writes (ADR-0050 for Key results): the cell
 * shows their live title and status, a target that no longer exists reads
 * as "(deleted)", and the next write to that cell drops it. Every target
 * must belong to the database's workspace.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  newPropertyId,
  parseProperties,
  type PropertyDef,
  type RelationTargetKind,
} from "~/lib/databases/schema";
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

/** Goal ids are integers; every other target id is a cuid. */
function goalIds(ids: readonly string[]): number[] {
  return ids.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * The ids among `ids` that name a live entity of `kind` in `workspaceId`.
 * A Ticket or Feature reaches its workspace through its Product; a Key
 * result through its own column or its Goal's.
 */
async function existingTargets(
  db: Db,
  kind: RelationTargetKind,
  ids: readonly string[],
  workspaceId: string,
): Promise<Set<string>> {
  switch (kind) {
    case "ROW":
      throw new Error("ROW targets are checked against their database");
    case "TICKET": {
      const found = await db.ticket.findMany({
        where: { id: { in: [...ids] }, product: { workspaceId } },
        select: { id: true },
      });
      return new Set(found.map((t) => t.id));
    }
    case "PROJECT": {
      const found = await db.project.findMany({
        where: { id: { in: [...ids] }, workspaceId },
        select: { id: true },
      });
      return new Set(found.map((p) => p.id));
    }
    case "FEATURE": {
      const found = await db.feature.findMany({
        where: { id: { in: [...ids] }, product: { workspaceId } },
        select: { id: true },
      });
      return new Set(found.map((f) => f.id));
    }
    case "GOAL": {
      const found = await db.goal.findMany({
        where: { id: { in: goalIds(ids) }, workspaceId },
        select: { id: true },
      });
      return new Set(found.map((g) => String(g.id)));
    }
    case "KEY_RESULT": {
      const found = await db.keyResult.findMany({
        where: { id: { in: [...ids] }, OR: [{ workspaceId }, { goal: { workspaceId } }] },
        select: { id: true },
      });
      return new Set(found.map((k) => k.id));
    }
    case "PAGE": {
      // An ordinary page of the workspace; rows are reached as ROW targets.
      const found = await db.knowledgePage.findMany({
        where: { id: { in: [...ids] }, workspaceId, databaseId: null },
        select: { id: true },
      });
      return new Set(found.map((p) => p.id));
    }
  }
}

export interface ReplaceRowRelationsInput {
  databaseId: string;
  /** The database's workspace: every target must be in it. */
  workspaceId: string;
  rowId: string;
  def: PropertyDef;
  /** The row's new targets, in order; empty clears the cell. */
  targetIds: string[];
}

/**
 * Set a row's targets under one relation property: its edges are replaced,
 * and for a `ROW` relation the inverse edges on the related database's
 * reverse column (if it has one) are rewritten to match. Targets must be
 * rows of the related database, or live entities of the target kind in the
 * database's workspace.
 */
export async function replaceRowRelations(
  tx: Db,
  { databaseId, workspaceId, rowId, def, targetIds }: ReplaceRowRelationsInput,
): Promise<void> {
  const rel = def.relation;
  if (!rel) refuse(def, "has no relation target");
  const ids = [...new Set(targetIds)];
  if (!rel.many && ids.length > 1) refuse(def, "takes one target");

  if (ids.length > 0) {
    let present: Set<string>;
    if (rel.targetKind === "ROW") {
      if (!rel.targetDatabaseId) refuse(def, "names no related database");
      const found = await tx.knowledgePage.findMany({
        where: { id: { in: ids }, databaseId: rel.targetDatabaseId },
        select: { id: true },
      });
      present = new Set(found.map((r) => r.id));
    } else {
      present = await existingTargets(tx, rel.targetKind, ids, workspaceId);
    }
    const missing = ids.find((id) => !present.has(id));
    if (missing) {
      refuse(
        def,
        rel.targetKind === "ROW"
          ? `names a row that is not in the related database: "${missing}"`
          : `names a ${rel.targetKind.toLowerCase().replace("_", " ")} that is not in this workspace: "${missing}"`,
      );
    }
  }

  await tx.databaseRelation.deleteMany({ where: { rowPageId: rowId, propertyId: def.id } });
  if (ids.length > 0) {
    await tx.databaseRelation.createMany({
      data: ids.map((id, position) => ({
        databaseId,
        propertyId: def.id,
        rowPageId: rowId,
        targetKind: rel.targetKind,
        targetId: id,
        targetRowPageId: rel.targetKind === "ROW" ? id : null,
        position,
      })),
    });
  }
  if (rel.targetKind !== "ROW" || !rel.targetDatabaseId) return;

  // The other side: drop every inverse edge that pointed at this row, then
  // add one on each new target, after whatever it already relates to.
  const target = await tx.pageDatabase.findUnique({
    where: { id: rel.targetDatabaseId },
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
  targetKind: RelationTargetKind;
  targetId: string;
  targetRowPage: { id: string; title: string } | null;
}

/** What a resolved native target contributes: its title, status and where it opens. */
interface NativeTarget {
  title: string;
  status?: string | null;
  href?: string;
}

const DELETED = "(deleted)";

function slugHref(workspaceSlug: string | null | undefined, path: string): string | undefined {
  return workspaceSlug ? `/w/${workspaceSlug}${path}` : undefined;
}

/**
 * Resolve the native targets among `edges`, one query per kind present, to
 * their live title and status. Readers of a database can read these
 * entities already (same workspace); a page or ticket they could not open
 * still shows its title, as a mention would.
 */
async function resolveNativeTargets(
  db: Db,
  edges: readonly EdgeRecord[],
  workspaceSlug: string | null | undefined,
): Promise<Map<string, NativeTarget>> {
  const byKind = new Map<RelationTargetKind, Set<string>>();
  for (const edge of edges) {
    if (edge.targetKind === "ROW") continue;
    (byKind.get(edge.targetKind) ?? byKind.set(edge.targetKind, new Set()).get(edge.targetKind)!).add(
      edge.targetId,
    );
  }
  const resolved = new Map<string, NativeTarget>();
  const key = (kind: RelationTargetKind, id: string) => `${kind}:${id}`;

  for (const [kind, idSet] of byKind) {
    const ids = [...idSet];
    switch (kind) {
      case "TICKET": {
        const tickets = await db.ticket.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, status: true, product: { select: { slug: true } } },
        });
        for (const t of tickets) {
          resolved.set(key(kind, t.id), {
            title: t.title,
            status: t.status,
            href: slugHref(workspaceSlug, `/products/${t.product.slug}/tickets/${t.id}`),
          });
        }
        break;
      }
      case "PROJECT": {
        const projects = await db.project.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, status: true, slug: true },
        });
        for (const p of projects) {
          resolved.set(key(kind, p.id), {
            title: p.name,
            status: p.status,
            href: slugHref(workspaceSlug, `/projects/${p.slug}`),
          });
        }
        break;
      }
      case "FEATURE": {
        const features = await db.feature.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, status: true, product: { select: { slug: true } } },
        });
        for (const f of features) {
          resolved.set(key(kind, f.id), {
            title: f.name,
            status: f.status,
            href: slugHref(workspaceSlug, `/products/${f.product.slug}/features/${f.id}`),
          });
        }
        break;
      }
      case "GOAL": {
        const goals = await db.goal.findMany({
          where: { id: { in: goalIds(ids) } },
          select: { id: true, title: true, status: true },
        });
        for (const g of goals) {
          resolved.set(key(kind, String(g.id)), {
            title: g.title,
            status: g.status,
            href: slugHref(workspaceSlug, `/goals/${g.id}`),
          });
        }
        break;
      }
      case "KEY_RESULT": {
        const keyResults = await db.keyResult.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, status: true, goalId: true },
        });
        for (const k of keyResults) {
          resolved.set(key(kind, k.id), {
            title: k.title,
            status: k.status,
            href: slugHref(workspaceSlug, `/goals/${k.goalId}`),
          });
        }
        break;
      }
      case "PAGE": {
        const pages = await db.knowledgePage.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        });
        for (const p of pages) {
          resolved.set(key(kind, p.id), {
            title: p.title || "Untitled",
            href: workspaceSlug ? buildPageEditorPath(workspaceSlug, p.id) : undefined,
          });
        }
        break;
      }
      case "ROW":
        break;
    }
  }
  return resolved;
}

function resolveTarget(
  edge: EdgeRecord,
  natives: Map<string, NativeTarget>,
  workspaceSlug: string | null | undefined,
): RelationTarget {
  if (edge.targetKind === "ROW") {
    if (!edge.targetRowPage) {
      return { kind: "ROW", id: edge.targetId, title: DELETED, deleted: true };
    }
    return {
      kind: "ROW",
      id: edge.targetId,
      title: edge.targetRowPage.title || "Untitled",
      ...(workspaceSlug ? { href: buildPageEditorPath(workspaceSlug, edge.targetId) } : {}),
    };
  }
  const native = natives.get(`${edge.targetKind}:${edge.targetId}`);
  if (!native) return { kind: edge.targetKind, id: edge.targetId, title: DELETED, deleted: true };
  return {
    kind: edge.targetKind,
    id: edge.targetId,
    title: native.title,
    ...(native.status !== undefined ? { status: native.status } : {}),
    ...(native.href ? { href: native.href } : {}),
  };
}

/**
 * Every relation value of the given rows, resolved, keyed by row then by
 * property — one query for the edges and one per native kind present. Rows
 * get an empty list for each relation property they have no edges under,
 * so a cell is never undefined. With no `workspaceSlug` (a public render)
 * targets carry no `href`.
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
  const natives = await resolveNativeTargets(db, edges, workspaceSlug);
  for (const edge of edges) {
    const row = result.get(edge.rowPageId);
    if (!row) continue;
    (row[edge.propertyId] ??= []).push(resolveTarget(edge, natives, workspaceSlug));
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
