import { STATUS_LABELS } from "~/lib/ticket-statuses";
import { TICKET_TYPES } from "~/lib/ticket-types";
import {
  EMPTY_TICKET_FILTERS,
  TICKET_FILTER_FACETS,
  type TicketFilterKey,
  type TicketFilters,
} from "./ticketFilters";

// ---------------------------------------------------------------------------
// Ticket view state <-> URL search params — the pure core of shareable
// Backlog / Graph links. A link carries the whole view (facet filters, sort,
// grouping, layout, entity, nesting) so whoever opens it sees what the sender
// saw, without touching their own saved view prefs.
//
// One readable param per piece of state, list values comma-joined, so a link
// is hand-editable and the Overview's legacy deep links (?status=BLOCKED,
// ?assignee=me) are ordinary instances of it:
//
//   status=BACKLOG,IN_PROGRESS  priority=1,none  type=BUG  assignee=me|<id>|none
//   epic=<id>  cycle=<id>  labels=<tagId>,<tagId>
//   sort=status:asc  group=cycle  layout=table|board|list|timeline
//   entity=tickets|epics  nest=1
//
// `layout` is the URL name of the pref called `view`; `view=` is reserved for
// a saved view's id. Anything else in the query (e.g. `peek`) is left alone.
//
// Parsing never throws: unknown params are ignored and malformed values
// dropped, so a mangled link degrades to a smaller view, never an error.
// ---------------------------------------------------------------------------

export type TicketViewSortDir = "asc" | "desc";

export interface TicketViewState {
  filters: TicketFilters;
  sortField?: string;
  sortDir?: TicketViewSortDir;
  groupBy?: string;
  layout?: string;
  entity?: "tickets" | "epics";
  nestDependencies?: boolean;
}

/** The facet keys as they appear in the URL (identical to TicketFilterKey). */
const FACET_PARAMS: readonly TicketFilterKey[] = TICKET_FILTER_FACETS.map((f) => f.key);

const SCALAR_PARAMS = ["sort", "group", "layout", "entity", "nest"] as const;

/** Every query param that is part of a ticket view (and nothing else). */
export const TICKET_VIEW_PARAMS: readonly string[] = [...FACET_PARAMS, ...SCALAR_PARAMS];

export const TICKET_VIEW_SORT_FIELDS = ["status", "title", "priority", "assignee", "type"] as const;
export const TICKET_VIEW_LAYOUTS = ["table", "board", "list", "timeline"] as const;

/** The literal a link uses for "the person opening it" in the assignee facet. */
export const ASSIGNEE_ME = "me";

const MAX_VALUES_PER_FACET = 200;
// Ids are cuids; enums are upper-case words; "none" is the unset bucket.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

const isStatus = (v: string) => Object.prototype.hasOwnProperty.call(STATUS_LABELS, v);
const isType = (v: string) => (TICKET_TYPES as readonly string[]).includes(v);
const isPriority = (v: string) => v === "none" || /^[0-9]{1,2}$/.test(v);
const isId = (v: string) => ID_PATTERN.test(v);

const FACET_VALIDATORS: Record<TicketFilterKey, (v: string) => boolean> = {
  status: isStatus,
  priority: isPriority,
  type: isType,
  assignee: isId,
  epic: isId,
  cycle: isId,
  labels: isId,
};

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

/** Whether the query carries any part of a ticket view. */
export function hasTicketViewParams(params: URLSearchParams): boolean {
  return TICKET_VIEW_PARAMS.some((key) => params.has(key));
}

export interface ParseTicketViewOptions {
  /** Resolves `assignee=me`. Without it "me" is kept as-is (matches nothing). */
  sessionUserId?: string;
  /** Group-by values the page supports; other values are dropped. */
  groupByValues?: readonly string[];
}

/**
 * The ticket view a URL carries, or null when it carries none. Facets absent
 * from the URL are empty (a link always states its whole filter set); the
 * scalar settings are present only when the URL names a valid value, so the
 * page can take the rest from the user's prefs.
 */
export function parseTicketViewParams(
  params: URLSearchParams,
  options: ParseTicketViewOptions = {},
): TicketViewState | null {
  if (!hasTicketViewParams(params)) return null;

  const filters: TicketFilters = { ...EMPTY_TICKET_FILTERS };
  for (const key of FACET_PARAMS) {
    const valid = FACET_VALIDATORS[key];
    const values = splitList(params.get(key))
      .map((v) =>
        key === "assignee" && v === ASSIGNEE_ME && options.sessionUserId
          ? options.sessionUserId
          : v,
      )
      .filter((v) => (key === "assignee" && v === ASSIGNEE_ME) || valid(v));
    filters[key] = Array.from(new Set(values)).slice(0, MAX_VALUES_PER_FACET);
  }

  const state: TicketViewState = { filters };

  const sort = params.get("sort");
  if (sort) {
    const [field, dir] = sort.split(":");
    if (field && (TICKET_VIEW_SORT_FIELDS as readonly string[]).includes(field)) {
      state.sortField = field;
      state.sortDir = dir === "desc" ? "desc" : "asc";
    }
  }

  const group = params.get("group");
  if (group && (!options.groupByValues || options.groupByValues.includes(group))) {
    state.groupBy = group;
  }

  const layout = params.get("layout");
  if (layout && (TICKET_VIEW_LAYOUTS as readonly string[]).includes(layout)) {
    state.layout = layout;
  }

  const entity = params.get("entity");
  if (entity === "tickets" || entity === "epics") state.entity = entity;

  const nest = params.get("nest");
  if (nest === "1" || nest === "0") state.nestDependencies = nest === "1";

  return state;
}

/**
 * Whether the state names every scalar setting, so nothing about the view
 * depends on the opener's saved prefs. Links built by buildTicketViewParams
 * are always complete; hand-written and legacy deep links usually are not.
 */
export function isCompleteTicketView(state: TicketViewState): boolean {
  return (
    state.sortField !== undefined &&
    state.sortDir !== undefined &&
    state.groupBy !== undefined &&
    state.layout !== undefined &&
    state.entity !== undefined &&
    state.nestDependencies !== undefined
  );
}

/**
 * The query for a ticket view: `base` with every view param replaced by the
 * state's. Params that are not part of a view (e.g. `peek`) are kept.
 */
export function buildTicketViewParams(
  state: TicketViewState,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  for (const key of TICKET_VIEW_PARAMS) next.delete(key);

  for (const key of FACET_PARAMS) {
    const values = state.filters[key];
    if (values.length > 0) next.set(key, values.join(","));
  }
  if (state.sortField) next.set("sort", `${state.sortField}:${state.sortDir ?? "asc"}`);
  if (state.groupBy) next.set("group", state.groupBy);
  if (state.layout) next.set("layout", state.layout);
  if (state.entity) next.set("entity", state.entity);
  if (state.nestDependencies !== undefined) next.set("nest", state.nestDependencies ? "1" : "0");
  return next;
}

/** `params` without any view param: the user's own (prefs) view. */
export function withoutTicketViewParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of TICKET_VIEW_PARAMS) next.delete(key);
  return next;
}

/**
 * URLSearchParams.toString percent-encodes the commas in list values and the
 * colon in `sort=field:dir`, which makes links needlessly hard to read; both
 * are legal in a query.
 */
export function ticketViewQueryString(params: URLSearchParams): string {
  return params.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":");
}
