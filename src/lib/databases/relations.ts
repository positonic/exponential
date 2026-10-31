import type { PropertyDef, RelationTargetKind } from "./schema";

/**
 * Relations (ADR-0078 §5) as readers see them. A relation property's value
 * is never in `KnowledgePage.properties`: it is the row's edges in
 * `DatabaseRelation`, resolved to what each target is called right now —
 * a row's title, a Ticket's title and status — and handed back on the row as
 * `relations[propertyId]`. Client-safe; the server resolves, the table shows.
 */
export interface RelationTarget {
  kind: RelationTargetKind;
  id: string;
  /** The target's current title; `(deleted)` when it no longer exists. */
  title: string;
  /** Where the target opens in the app, when the reader may follow it. */
  href?: string;
  /** A native target's status, live, for kinds that have one. */
  status?: string | null;
  deleted?: boolean;
}

/** A row's relation targets keyed by property id. */
export type RowRelations = Record<string, RelationTarget[]>;

export const RELATION_TARGET_LABELS: Record<RelationTargetKind, string> = {
  ROW: "Database",
  TICKET: "Ticket",
  PROJECT: "Project",
  FEATURE: "Feature",
  GOAL: "Goal",
  KEY_RESULT: "Key result",
  PAGE: "Page",
};

/**
 * The property on the other database that mirrors `def` — the reverse
 * column a two-way relation creates. The reverse names its forward through
 * `inverseOf`; the forward finds its reverse by that same mark.
 */
export function inverseProperty(
  def: PropertyDef,
  ownDatabaseId: string,
  targetProperties: readonly PropertyDef[],
): PropertyDef | undefined {
  const rel = def.relation;
  if (!rel || rel.targetKind !== "ROW") return undefined;
  if (rel.inverseOf) {
    const forwardId = rel.inverseOf.propertyId;
    return targetProperties.find((p) => p.id === forwardId);
  }
  return targetProperties.find(
    (p) =>
      p.relation?.inverseOf?.databaseId === ownDatabaseId &&
      p.relation.inverseOf.propertyId === def.id,
  );
}

/** A name for the reverse column: the source database's name, made unique on the target. */
export function reversePropertyName(
  sourceName: string,
  targetProperties: readonly PropertyDef[],
): string {
  const taken = new Set(targetProperties.map((p) => p.name.trim().toLowerCase()));
  const base = sourceName.trim() || "Related";
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
