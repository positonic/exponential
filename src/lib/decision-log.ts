/**
 * The Decision Log's client-side merge of two sources (ADR-0060): git-projected
 * ADRs (`adr.list`) and Exponential-owned Decisions (`decision.list`) become
 * one row shape. A server-side union was rejected because it would drag
 * `adr.list`'s human-only gate onto decisions, so the join happens here, as
 * a pure function the index can test.
 */

export type LogStatus =
  | "OPEN"
  | "PROPOSED"
  | "ACCEPTED"
  | "SUPERSEDED"
  | "DEPRECATED"
  | "UNKNOWN";

/** The Source facet: where a decision is recorded. AGENT-logged rows count as Manual. */
export type LogSource = "code" | "meeting" | "manual";

export interface LogGroup {
  key: string;
  kind: "repository" | "ceremony" | "project" | "workspace";
  name: string;
}

export interface LogRow {
  kind: "adr" | "decision";
  id: string;
  label: string | null;
  title: string;
  status: LogStatus;
  decidedAt: Date | string | null;
  source: LogSource;
  /** Product the row belongs to; null = workspace-wide. */
  productId: string | null;
  group: LogGroup;
  href: string;
  /** Sort key within a group: repo+number for ADRs, number for decisions. */
  order: number;
}

export interface AdrRowInput {
  id: string;
  label: string | null;
  number: number | null;
  title: string;
  status: LogStatus;
  decidedAt: Date | string | null;
  repositoryId: string;
  repositoryFullName: string;
  productId: string | null;
}

export interface DecisionRowInput {
  id: string;
  label: string;
  number: number;
  statement: string;
  status: LogStatus;
  source: "MEETING" | "MANUAL" | "AGENT";
  decidedAt: Date | string | null;
  productId: string | null;
  occurrence: { id: string; ceremony: { id: string; name: string } } | null;
  project: { id: string; name: string } | null;
}

export function decisionSourceFacet(source: DecisionRowInput["source"]): LogSource {
  return source === "MEETING" ? "meeting" : "manual";
}

/**
 * Decisions group under the ceremony they were an output of when one is
 * set, else under their project, else a workspace bucket — never under a
 * repository, which is an ADR's home.
 */
export function decisionGroup(row: DecisionRowInput): LogGroup {
  if (row.occurrence) {
    return {
      key: `ceremony:${row.occurrence.ceremony.id}`,
      kind: "ceremony",
      name: row.occurrence.ceremony.name,
    };
  }
  if (row.project) {
    return { key: `project:${row.project.id}`, kind: "project", name: row.project.name };
  }
  return { key: "workspace", kind: "workspace", name: "Workspace" };
}

export function adrToLogRow(adr: AdrRowInput, workspaceSlug: string): LogRow {
  return {
    kind: "adr",
    id: adr.id,
    label: adr.label,
    title: adr.title,
    status: adr.status,
    decidedAt: adr.decidedAt,
    source: "code",
    productId: adr.productId,
    group: {
      key: `repo:${adr.repositoryId}`,
      kind: "repository",
      name: adr.repositoryFullName,
    },
    href: `/w/${workspaceSlug}/decisions/${adr.id}`,
    order: adr.number ?? Number.MAX_SAFE_INTEGER,
  };
}

export function decisionToLogRow(decision: DecisionRowInput, workspaceSlug: string): LogRow {
  return {
    kind: "decision",
    id: decision.id,
    label: decision.label,
    title: decision.statement,
    status: decision.status,
    decidedAt: decision.decidedAt,
    source: decisionSourceFacet(decision.source),
    productId: decision.productId,
    group: decisionGroup(decision),
    href: `/w/${workspaceSlug}/decisions/d/${decision.id}`,
    order: decision.number,
  };
}

export interface LogFilters {
  source: LogSource | "all";
  status: LogStatus | "all";
  /** Lower-cased query; matches label + title on the client. */
  query: string;
  /** Ids whose body matched the query server-side, unioned in. */
  bodyMatchIds?: ReadonlySet<string>;
}

export function filterLogRows(rows: LogRow[], filters: LogFilters): LogRow[] {
  return rows.filter((row) => {
    if (filters.source !== "all" && row.source !== filters.source) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (!filters.query) return true;
    return (
      `${row.label ?? ""} ${row.title}`.toLowerCase().includes(filters.query) ||
      (filters.bodyMatchIds?.has(row.id) ?? false)
    );
  });
}

function timeOf(date: Date | string | null): number {
  if (!date) return 0;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Flat order: newest decided first, undated last; ties by label number.
 * Mixed-source lists read as a timeline, which is what a flat log is for.
 */
export function sortFlat(rows: LogRow[]): LogRow[] {
  return [...rows].sort((a, b) => {
    const dt = timeOf(b.decidedAt) - timeOf(a.decidedAt);
    if (dt !== 0) return dt;
    if (a.kind !== b.kind) return a.kind === "adr" ? -1 : 1;
    return b.order - a.order;
  });
}

export interface LogGroupRows {
  group: LogGroup;
  rows: LogRow[];
}

/**
 * Group rows for the headed view: repositories first (as today), then
 * ceremonies, projects and the workspace bucket. Within a repository ADRs
 * keep their number order (the conflict bracketing relies on it); decision
 * groups read newest first.
 */
export function groupLogRows(rows: LogRow[]): LogGroupRows[] {
  const byKey = new Map<string, LogGroupRows>();
  for (const row of rows) {
    const g = byKey.get(row.group.key) ?? { group: row.group, rows: [] };
    g.rows.push(row);
    byKey.set(row.group.key, g);
  }
  const kindOrder: Record<LogGroup["kind"], number> = {
    repository: 0,
    ceremony: 1,
    project: 2,
    workspace: 3,
  };
  return [...byKey.values()]
    .map((g) => ({
      group: g.group,
      rows:
        g.group.kind === "repository"
          ? [...g.rows].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
          : sortFlat(g.rows),
    }))
    .sort(
      (a, b) =>
        kindOrder[a.group.kind] - kindOrder[b.group.kind] ||
        a.group.name.localeCompare(b.group.name),
    );
}
