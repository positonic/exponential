import {
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
} from "~/lib/ticket-statuses";
import { TICKET_TYPES, type TicketTypeValue } from "~/lib/ticket-types";
import { PRIORITY_LABELS } from "~/app/_components/product/PriorityIcon";

// ---------------------------------------------------------------------------
// Ticket facet filters — the pure core shared by the Backlog (table / list /
// board) and the dependency Graph, which read and write the same saved
// `filters` view pref so a filter set on one tab carries to the other.
//
// Facet values are ids or enums; "none" is the synthetic value for the unset
// bucket (no priority / unassigned / no epic / no cycle).
// ---------------------------------------------------------------------------

export type TicketFilterKey =
  | "status"
  | "priority"
  | "type"
  | "assignee"
  | "epic"
  | "cycle"
  | "labels";

export type TicketFilters = Record<TicketFilterKey, string[]>;

export type TicketFacetOptions = Record<
  TicketFilterKey,
  Array<{ value: string; label: string }>
>;

// Arrays are never mutated in place (all updates spread), so a shared empty
// reference is safe to use as the default / cleared state.
export const EMPTY_TICKET_FILTERS: TicketFilters = {
  status: [], priority: [], type: [], assignee: [], epic: [], cycle: [], labels: [],
};

export const TICKET_FILTER_FACETS: ReadonlyArray<{ key: TicketFilterKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "type", label: "Type" },
  { key: "assignee", label: "DRI" },
  { key: "epic", label: "Epic" },
  { key: "cycle", label: "Cycle" },
  { key: "labels", label: "Labels" },
];

export const TICKET_TYPE_COLORS: Record<string, string> = {
  BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow",
};

export const TICKET_TYPE_LABELS: Record<TicketTypeValue, string> = {
  BUG: "Bug", FEATURE: "Feature", CHORE: "Chore", IMPROVEMENT: "Improvement", SPIKE: "Spike", RESEARCH: "Research",
};

export const TICKET_TYPE_OPTIONS = TICKET_TYPES.map((value) => ({
  value,
  label: TICKET_TYPE_LABELS[value],
}));

// Colours of the toolbar pills naming each applied filter; status and type
// pills take the value's own colour instead.
const FACET_PILL_COLORS: Record<Exclude<TicketFilterKey, "status" | "type">, string> = {
  priority: "grape", assignee: "brand", epic: "indigo", cycle: "cyan", labels: "teal",
};

/** The columns the filters read; both ticket summaries and graph tickets fit. */
export interface FilterableTicket {
  status: string;
  priority: number | null;
  type: string;
  assignee: { id: string; name: string | null } | null;
  epic: { id: string; name: string } | null;
  cycle: { id: string; name: string } | null;
  tags?: Array<{ tag: { id: string; name: string } }> | null;
}

/**
 * Saved prefs are untrusted JSON: take each facet only when it is an array,
 * and anything else (missing, malformed) as no filter. Stale values (e.g. a
 * deleted epic id) are harmless: they match no tickets and aren't offered in
 * the facet options.
 */
export function parseSavedTicketFilters(raw: unknown): TicketFilters {
  if (!raw || typeof raw !== "object") return EMPTY_TICKET_FILTERS;
  const f = raw as Partial<Record<TicketFilterKey, unknown>>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    status: arr(f.status),
    priority: arr(f.priority),
    type: arr(f.type),
    assignee: arr(f.assignee),
    epic: arr(f.epic),
    cycle: arr(f.cycle),
    labels: arr(f.labels),
  };
}

export function countActiveTicketFilters(filters: TicketFilters): number {
  return TICKET_FILTER_FACETS.reduce((n, f) => n + filters[f.key].length, 0);
}

/** Flip one facet value on or off, returning a new filters object. */
export function toggleTicketFilter(
  filters: TicketFilters,
  key: TicketFilterKey,
  value: string,
): TicketFilters {
  const cur = filters[key];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return { ...filters, [key]: next };
}

/** Whether a ticket passes every applied facet (an empty facet passes all). */
export function matchesTicketFilters(t: FilterableTicket, filters: TicketFilters): boolean {
  if (filters.status.length && !filters.status.includes(t.status)) return false;
  if (filters.priority.length && !filters.priority.includes(t.priority == null ? "none" : String(t.priority))) return false;
  if (filters.type.length && !filters.type.includes(t.type)) return false;
  if (filters.assignee.length && !filters.assignee.includes(t.assignee?.id ?? "none")) return false;
  if (filters.epic.length && !filters.epic.includes(t.epic?.id ?? "none")) return false;
  if (filters.cycle.length && !filters.cycle.includes(t.cycle?.id ?? "none")) return false;
  if (filters.labels.length && !(t.tags ?? []).some((x) => filters.labels.includes(x.tag.id))) return false;
  return true;
}

/**
 * The values each facet offers, derived from the loaded tickets so only
 * values actually present in the product are offered. "none" always sorts
 * last; other values alphabetical by label (status by board order, priority
 * by rank).
 */
export function deriveTicketFacetOptions(tickets: readonly FilterableTicket[]): TicketFacetOptions {
  const status = new Map<string, string>();
  const priority = new Map<string, string>();
  const type = new Map<string, string>();
  const assignee = new Map<string, string>();
  const epic = new Map<string, string>();
  const cycle = new Map<string, string>();
  const labels = new Map<string, string>();

  for (const t of tickets) {
    status.set(t.status, STATUS_LABELS[t.status] ?? t.status);
    const pKey = t.priority == null ? "none" : String(t.priority);
    priority.set(pKey, t.priority == null ? "No priority" : (PRIORITY_LABELS[t.priority] ?? pKey));
    type.set(t.type, t.type.toLowerCase());
    assignee.set(t.assignee?.id ?? "none", t.assignee?.name ?? "Unassigned");
    epic.set(t.epic?.id ?? "none", t.epic?.name ?? "No epic");
    cycle.set(t.cycle?.id ?? "none", t.cycle?.name ?? "No cycle");
    for (const x of t.tags ?? []) labels.set(x.tag.id, x.tag.name);
  }

  const toOpts = (m: Map<string, string>) =>
    Array.from(m, ([value, label]) => ({ value, label }));
  const alpha = (m: Map<string, string>) =>
    toOpts(m).sort((a, b) =>
      a.value === "none" ? 1 : b.value === "none" ? -1 : a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );

  return {
    status: toOpts(status).sort((a, b) => (STATUS_ORDER[a.value] ?? 99) - (STATUS_ORDER[b.value] ?? 99)),
    priority: toOpts(priority).sort(
      (a, b) => (a.value === "none" ? 99 : Number(a.value)) - (b.value === "none" ? 99 : Number(b.value)),
    ),
    type: alpha(type),
    assignee: alpha(assignee),
    epic: alpha(epic),
    cycle: alpha(cycle),
    labels: alpha(labels),
  };
}

/** Entity lists a page can hand `ticketFacetPillLabel` to name saved values. */
export interface TicketFacetNameSources {
  members?: ReadonlyArray<{ id: string; name: string | null }>;
  epics?: ReadonlyArray<{ id: string; name: string }>;
  cycles?: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * The toolbar pill text for one applied facet value. Names come from the
 * page's own entity lists first, then the ticket-derived facets: a saved
 * filter can name an epic, cycle or member that no loaded ticket carries
 * (deleted, or narrowed out upstream), and a raw id is no label.
 */
export function ticketFacetPillLabel(
  key: TicketFilterKey,
  value: string,
  facetOptions: TicketFacetOptions,
  sources: TicketFacetNameSources = {},
): string {
  const fromFacets = facetOptions[key].find((o) => o.value === value)?.label;
  if (value === "none") return fromFacets ?? "None"; // "No priority", "Unassigned", "No epic"...
  switch (key) {
    case "status": return STATUS_LABELS[value] ?? value;
    case "priority": {
      const n = Number(value);
      // 4 is the stored "No priority", which already names itself.
      return n === 4 ? (PRIORITY_LABELS[4] ?? "No priority") : `${PRIORITY_LABELS[n] ?? value} priority`;
    }
    case "type": return TICKET_TYPE_LABELS[value as TicketTypeValue] ?? value;
    case "assignee":
      return `DRI: ${sources.members?.find((m) => m.id === value)?.name ?? fromFacets ?? "Unknown member"}`;
    case "epic":
      return `Epic: ${sources.epics?.find((e) => e.id === value)?.name ?? fromFacets ?? "Unknown epic"}`;
    case "cycle":
      return sources.cycles?.find((c) => c.id === value)?.name ?? fromFacets ?? "Unknown cycle";
    case "labels":
      return fromFacets ?? "Unknown label";
  }
}

export function ticketFacetPillColor(key: TicketFilterKey, value: string): string {
  if (key === "status") return STATUS_COLORS[value] ?? "gray";
  if (key === "type") return TICKET_TYPE_COLORS[value] ?? "gray";
  return FACET_PILL_COLORS[key];
}
