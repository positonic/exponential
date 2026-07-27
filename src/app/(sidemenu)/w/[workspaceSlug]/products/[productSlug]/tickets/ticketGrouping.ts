import { STATUS_LABELS } from "~/lib/ticket-statuses";
import { PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";

// ---------------------------------------------------------------------------
// Group by — pure, testable core of the tickets board grouping.
//
// Maps (tickets, groupByField) → an ordered list of { key, label, items }
// buckets. Most fields produce exactly one bucket per ticket; "area" is
// multi-membership (a ticket may land in several Area buckets, or in the
// pinned-last "No area" bucket).
// ---------------------------------------------------------------------------

export type GroupByField =
  | "none"
  | "status"
  | "priority"
  | "cycle"
  | "epic"
  | "type"
  | "assignee"
  | "area";

export const GROUP_BY_OPTIONS: Array<{ value: GroupByField; label: string }> = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "cycle", label: "Cycle" },
  { value: "epic", label: "Epic" },
  { value: "area", label: "Area" },
  { value: "type", label: "Type" },
  { value: "assignee", label: "DRI" },
];

export interface TicketGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Sentinel key/label for tickets carrying no Area tag. */
export const NO_AREA_KEY = "__no_area__";
export const NO_AREA_LABEL = "No area";

/** Category value that marks a Tag as an Area (sub-product / repository). */
export const AREA_CATEGORY = "area";

const NO_CYCLE_KEY = "No cycle";

/** Minimal ticket shape the grouping logic reads. */
export interface GroupableTicket {
  status?: string | null;
  priority?: number | null;
  cycle?: {
    name?: string | null;
    status?: string | null;
    startDate?: string | Date | null;
  } | null;
  epic?: { name?: string | null } | null;
  type?: string | null;
  assignee?: { name?: string | null } | null;
  tags?: Array<{ tag: { id: string; name: string; category?: string | null } }> | null;
}

/**
 * The (key, label) buckets a single ticket belongs to for a given field.
 * Returns one entry for single-valued fields, and one-per-Area (or the
 * "No area" sentinel) for the multi-membership "area" field.
 */
function bucketsForTicket(
  t: GroupableTicket,
  field: Exclude<GroupByField, "none">,
): Array<{ key: string; label: string }> {
  switch (field) {
    case "status": {
      const key = t.status ?? "UNKNOWN";
      return [{ key, label: STATUS_LABELS[key] ?? key }];
    }
    case "priority": {
      if (t.priority == null) return [{ key: "unset", label: "No priority" }];
      const key = String(t.priority);
      return [{ key, label: PRIORITY_LABELS[t.priority] ?? key }];
    }
    case "cycle": {
      const name = t.cycle?.name ?? NO_CYCLE_KEY;
      return [{ key: name, label: name }];
    }
    case "epic": {
      const name = t.epic?.name ?? "No epic";
      return [{ key: name, label: name }];
    }
    case "type": {
      const key = t.type ?? "UNKNOWN";
      return [{ key, label: key }];
    }
    case "assignee": {
      const name = t.assignee?.name ?? "Unassigned";
      return [{ key: name, label: name }];
    }
    case "area": {
      const areas = (t.tags ?? []).filter((x) => x.tag.category === AREA_CATEGORY);
      if (areas.length === 0) return [{ key: NO_AREA_KEY, label: NO_AREA_LABEL }];
      return areas.map((x) => ({ key: x.tag.id, label: x.tag.name }));
    }
  }
}

/** Smart cycle ordering: ACTIVE first, then PLANNED by startDate, "No cycle" last. */
function sortCycleGroups<T extends GroupableTicket>(groups: Array<TicketGroup<T>>): void {
  const cycleStatusOrder: Record<string, number> = {
    ACTIVE: 0,
    PLANNED: 1,
    COMPLETED: 2,
    ARCHIVED: 3,
  };
  groups.sort((a, b) => {
    if (a.key === NO_CYCLE_KEY) return 1;
    if (b.key === NO_CYCLE_KEY) return -1;
    const aCycle = a.items[0]?.cycle;
    const bCycle = b.items[0]?.cycle;
    const aStatus = cycleStatusOrder[aCycle?.status ?? ""] ?? 99;
    const bStatus = cycleStatusOrder[bCycle?.status ?? ""] ?? 99;
    if (aStatus !== bStatus) return aStatus - bStatus;
    const aStart = aCycle?.startDate ? new Date(aCycle.startDate).getTime() : Infinity;
    const bStart = bCycle?.startDate ? new Date(bCycle.startDate).getTime() : Infinity;
    return aStart - bStart;
  });
}

/** Area ordering: alphabetical by name, "No area" pinned last. */
function sortAreaGroups<T>(groups: Array<TicketGroup<T>>): void {
  groups.sort((a, b) => {
    if (a.key === NO_AREA_KEY) return 1;
    if (b.key === NO_AREA_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

/**
 * Bucket tickets into ordered groups for the board's group-by control.
 *
 * - `none` → a single unlabelled bucket containing every ticket.
 * - Single-valued fields (status/priority/cycle/epic/type/assignee) → one
 *   bucket per ticket, in first-seen order (with cycle smart-ordered).
 * - `area` → multi-membership: a ticket appears under each of its Area tags,
 *   or in the "No area" bucket; ordered alphabetically with "No area" last.
 */
export function groupTickets<T extends GroupableTicket>(
  tickets: T[],
  field: GroupByField,
): Array<TicketGroup<T>> {
  if (field === "none") {
    return [{ key: "all", label: "", items: tickets }];
  }

  const map = new Map<string, TicketGroup<T>>();
  for (const t of tickets) {
    for (const { key, label } of bucketsForTicket(t, field)) {
      const existing = map.get(key);
      if (existing) existing.items.push(t);
      else map.set(key, { key, label, items: [t] });
    }
  }

  const result = Array.from(map.values());

  if (field === "cycle") sortCycleGroups(result);
  else if (field === "area") sortAreaGroups(result);

  return result;
}
