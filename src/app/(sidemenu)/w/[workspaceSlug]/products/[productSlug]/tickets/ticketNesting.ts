// ---------------------------------------------------------------------------
// Nest dependencies — pure, testable core of the Backlog's "Nest
// dependencies" display toggle (table and list views).
//
// Turns a flat, already filtered-and-sorted list into a tree walk where each
// ticket's dependencies (the tickets it *depends on*, i.e. its blockers) sit
// indented under it. Roots are the tickets nothing else in the list depends
// on: the top of each chain, with the work it waits for nested beneath.
//
// Dependencies form a DAG, not a tree, so a ticket several others depend on
// appears under each of them. A ticket whose parents are all absent from the
// list (filtered out, or in another section) is a root. Dependency cycles
// are tolerated: a ticket never repeats within its own ancestry, and any
// chain unreachable from a true root is promoted to one.
// ---------------------------------------------------------------------------

/** Minimal ticket shape the nesting reads. */
export interface NestableTicket {
  id: string;
  /** Ids of the tickets this one depends on (its blockers). */
  dependsOnIds: readonly string[];
}

export interface NestedTicketRow<T> {
  ticket: T;
  /** 0 for roots; each nesting level adds one. */
  depth: number;
  /**
   * Unique within the result even when the same ticket appears under several
   * parents: the ids along the path from the root, "/"-joined.
   */
  rowKey: string;
  /** Dependencies of this ticket that are in the list (shown when expanded). */
  childCount: number;
  /** Whether this row's children are hidden by the caller's collapsed set. */
  isCollapsed: boolean;
}

/** Nesting deeper than this is cut off: a chain this long is a data smell. */
export const MAX_NESTING_DEPTH = 8;

/**
 * Walk `tickets` as a dependency tree, in the input order at every level.
 * Children of a collapsed ticket (by id, so collapsing applies to every
 * place it appears) are left out, but the row itself still reports its
 * `childCount` so the caller can draw a chevron.
 */
export function nestTicketsByDependency<T extends NestableTicket>(
  tickets: readonly T[],
  collapsedIds: ReadonlySet<string> = new Set(),
): Array<NestedTicketRow<T>> {
  const order = new Map<string, number>();
  const byId = new Map<string, T>();
  tickets.forEach((t, i) => {
    order.set(t.id, i);
    byId.set(t.id, t);
  });

  // Children in list order: for each ticket, the listed tickets it depends on.
  const childrenOf = new Map<string, T[]>();
  const hasParentInList = new Set<string>();
  for (const t of tickets) {
    const kids: T[] = [];
    for (const depId of new Set(t.dependsOnIds)) {
      const dep = byId.get(depId);
      if (dep && dep.id !== t.id) {
        kids.push(dep);
        hasParentInList.add(dep.id);
      }
    }
    kids.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    childrenOf.set(t.id, kids);
  }

  // Roots: tickets with no parent in the list, plus one member of any pure
  // cycle (every member has a parent, so none would otherwise be reached).
  // Reachability ignores collapsing so a collapsed parent's hidden children
  // are never mistaken for orphans and promoted.
  const reached = new Set<string>();
  const reach = (t: T) => {
    if (reached.has(t.id)) return;
    reached.add(t.id);
    for (const k of childrenOf.get(t.id) ?? []) reach(k);
  };
  const roots: T[] = [];
  for (const t of tickets) {
    if (!hasParentInList.has(t.id)) {
      roots.push(t);
      reach(t);
    }
  }
  for (const t of tickets) {
    if (!reached.has(t.id)) {
      roots.push(t);
      reach(t);
    }
  }
  roots.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  const rows: Array<NestedTicketRow<T>> = [];
  const walk = (t: T, depth: number, ancestry: string[]) => {
    const path = [...ancestry, t.id];
    const kids = (childrenOf.get(t.id) ?? []).filter((k) => !path.includes(k.id));
    const isCollapsed = collapsedIds.has(t.id);
    rows.push({
      ticket: t,
      depth,
      rowKey: path.join("/"),
      childCount: kids.length,
      isCollapsed,
    });
    if (isCollapsed || depth >= MAX_NESTING_DEPTH) return;
    for (const k of kids) walk(k, depth + 1, path);
  };
  for (const r of roots) walk(r, 0, []);

  return rows;
}
