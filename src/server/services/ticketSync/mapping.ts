import type { TicketStatus, TicketType } from "@prisma/client";

/**
 * ticketSync/mapping — Notion property values ↔ Ticket fields.
 *
 * The single home of the tolerant mapping heuristics that grew up in the
 * cycle importer (status names, "1 - High" priorities, "L (5pts)" efforts,
 * typed titles). The importer and the sync engine both consume these; the
 * status map is configurable per sync (seeded with {@link DEFAULT_STATUS_MAP}
 * and stored on `TicketSyncConfig.statusMap`).
 *
 * Everything here is pure — no Prisma, no Notion client.
 */

export const TICKET_STATUSES = [
  "BACKLOG", "NEEDS_REFINEMENT", "READY_TO_PLAN", "COMMITTED",
  "IN_PROGRESS", "BLOCKED", "QA", "DONE", "DEPLOYED", "ARCHIVED",
] as const;

/**
 * The Notion page id a ticket carries in its `links` JSON — the provenance the
 * cycle importer writes for every row it creates.
 *
 * This lives here, shared, because two opposite decisions must agree on it:
 * the inbound ADOPTION pass (engine.ts) uses it to link an unsynced ticket to
 * the page it came from, and the outbound CREATE guard (pushRunner.ts) uses it
 * to refuse to mirror that same ticket back out. When the two disagreed, the
 * pre-sync import cohort — tickets with provenance but no `TicketSync` row —
 * was adoptable by one and duplicable by the other, and the backfill minted a
 * second Notion page for rows Notion already had.
 */
export function extractNotionPageId(links: unknown): string | null {
  if (!links || typeof links !== "object" || Array.isArray(links)) return null;
  const value = (links as Record<string, unknown>).notionPageId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** True when a ticket's `links` JSON records that it originated in Notion. */
export function hasNotionProvenance(links: unknown): boolean {
  return extractNotionPageId(links) !== null;
}

/**
 * Notion status/select name → TicketStatus. Keys are normalized (lowercased,
 * emoji/punctuation stripped). Anything unmapped falls back to BACKLOG with a
 * per-item warning rather than failing the row.
 */
export const DEFAULT_STATUS_MAP: Record<string, TicketStatus> = {
  "backlog": "BACKLOG",
  "triage": "BACKLOG",
  "todo": "BACKLOG",
  "to do": "BACKLOG",
  "needs refinement": "NEEDS_REFINEMENT",
  "refinement": "NEEDS_REFINEMENT",
  "ready to plan": "READY_TO_PLAN",
  "ready": "READY_TO_PLAN",
  "planned": "COMMITTED",
  "committed": "COMMITTED",
  "in progress": "IN_PROGRESS",
  "doing": "IN_PROGRESS",
  "blocked": "BLOCKED",
  "qa": "QA",
  "qa ready": "QA",
  "in review": "QA",
  "review": "QA",
  "done": "DONE",
  "complete": "DONE",
  "completed": "DONE",
  "deployed": "DEPLOYED",
  "shipped": "DEPLOYED",
  "archived": "ARCHIVED",
  "cancelled": "ARCHIVED",
  "canceled": "ARCHIVED",
  "wont do": "ARCHIVED",
};

/** Substring → TicketType, checked in order. Falls back to FEATURE. */
const TYPE_HINTS: Array<[string, TicketType]> = [
  ["bug", "BUG"],
  ["spike", "SPIKE"],
  ["research", "RESEARCH"],
  ["chore", "CHORE"],
  ["improvement", "IMPROVEMENT"],
  ["ticket", "FEATURE"],
];

/** Lowercase and strip emoji/symbols so "🚨 Bug" and "QA-ready" match tables. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A per-sync status map with normalized keys, falling back to the defaults. */
function resolveStatusMap(
  statusMap?: Record<string, TicketStatus> | null,
): Record<string, TicketStatus> {
  if (!statusMap) return DEFAULT_STATUS_MAP;
  const normalized: Record<string, TicketStatus> = {};
  for (const [key, value] of Object.entries(statusMap)) {
    if ((TICKET_STATUSES as readonly string[]).includes(value)) {
      normalized[normalizeName(key)] = value;
    }
  }
  return { ...DEFAULT_STATUS_MAP, ...normalized };
}

export function mapStatus(
  raw: string | null,
  statusMap?: Record<string, TicketStatus> | null,
): { status: TicketStatus; warning?: string } {
  if (!raw) return { status: "BACKLOG" };
  const map = resolveStatusMap(statusMap);
  const key = normalizeName(raw);
  // Exact enum name passed through (e.g. a Notion status literally named "QA").
  const asEnum = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const direct = TICKET_STATUSES.find((s) => s === asEnum);
  const mapped = map[key] ?? direct;
  if (!mapped) {
    return { status: "BACKLOG", warning: `Status "${raw}" not recognized — defaulted to BACKLOG` };
  }
  return { status: mapped };
}

/**
 * Ticket status → the Notion status option to write, or `null` when no write
 * is needed. Implements the sticky-collapse rule: when several ticket statuses
 * map to one Notion option, moving between them must NOT touch Notion — we
 * only write when the option the current status maps to actually differs from
 * the option already set on the page.
 *
 * `availableOptions` is the Notion database's actual option list (with its
 * exact casing); the first option that round-trips to `status` wins. Without
 * it we fall back to the first matching (normalized) map key.
 */
export function mapStatusToNotion(
  status: TicketStatus,
  params: {
    statusMap?: Record<string, TicketStatus> | null;
    /** The status option currently set on the Notion page, raw. */
    currentRemoteRaw: string | null;
    /** The database's real option names, in schema order. */
    availableOptions?: string[];
  },
): string | null {
  const { statusMap, currentRemoteRaw, availableOptions } = params;

  // Sticky collapse: the page's current option already means this status.
  if (
    currentRemoteRaw !== null &&
    mapStatus(currentRemoteRaw, statusMap).status === status
  ) {
    return null;
  }

  if (availableOptions && availableOptions.length > 0) {
    for (const option of availableOptions) {
      if (mapStatus(option, statusMap).status === status) return option;
    }
    return null; // no option in this database maps to the status — skip, don't guess
  }

  const map = resolveStatusMap(statusMap);
  for (const [key, value] of Object.entries(map)) {
    if (value === status) return key;
  }
  return null;
}

/** "1 - High" / "P2" / "0 - Critical" → 0..4, else undefined. */
export function mapPriority(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const match = /\d+/.exec(raw);
  if (!match) return undefined;
  const n = parseInt(match[0], 10);
  return n >= 0 && n <= 4 ? n : undefined;
}

/** "L (5pts)" / "3 pts" / "M (3pts)" → numeric points, else undefined. */
export function mapPoints(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*pts?/i.exec(raw);
  if (!match?.[1]) return undefined;
  return parseFloat(match[1]);
}

export function mapType(raw: string | null): TicketType {
  if (!raw) return "FEATURE";
  const key = normalizeName(raw);
  for (const [hint, type] of TYPE_HINTS) {
    if (key.includes(hint)) return type;
  }
  return "FEATURE";
}

/** Read a select/status/multi-select property's name(s) from a raw Notion page. */
export function readOptionNames(
  props: Record<string, unknown>,
  property: string,
): string[] {
  const prop = props?.[property] as
    | {
        type?: string;
        select?: { name?: string } | null;
        status?: { name?: string } | null;
        multi_select?: Array<{ name?: string }> | null;
      }
    | undefined;
  if (!prop) return [];
  if (prop.type === "select") return prop.select?.name ? [prop.select.name] : [];
  if (prop.type === "status") return prop.status?.name ? [prop.status.name] : [];
  if (prop.type === "multi_select") {
    return (prop.multi_select ?? [])
      .map((s) => s.name)
      .filter((n): n is string => Boolean(n));
  }
  return [];
}

export function firstOptionName(
  props: Record<string, unknown>,
  property: string,
): string | null {
  return readOptionNames(props, property)[0] ?? null;
}
