"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Menu, Skeleton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconAffiliate,
  IconChevronDown,
  IconClock,
  IconCode,
  IconFlag,
  IconFolder,
  IconList,
  IconMicrophone,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconQuote,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { WORKSPACE_PERMISSION_MAP, hasMinimumWorkspaceRole } from "~/server/services/access/types";
import { LogDecisionModal } from "./LogDecisionModal";
import {
  decisionToLogRow,
  filterLogRows,
  groupLogRows,
  isWorkspaceWide,
  type LogGroup,
  type LogSource,
  type LogStatus,
} from "~/lib/decision-log";
import "./decisions-index.css";

/**
 * The Decision Log index, shared between the workspace page
 * (/w/[slug]/decisions) and the product Decisions lens
 * (/w/[slug]/products/[productSlug]/decisions). One index, two sources
 * (ADR-0060): git-projected ADRs from `adr.list` (read-only — git is the
 * source of truth and no write path to ADR content exists) and
 * Exponential-owned Decisions from `decision.list`, merged client-side under
 * a Source facet (Code / Meeting / Manual). ADRs keep their repository
 * headers; decisions group under the ceremony or project they came from.
 *
 * Presentation follows the Decisions handoff: rows group under collapsible
 * repository headers (a Flat mode restores one list and is forced on while
 * searching), status is a dot + word rather than a pill, blue is reserved
 * for interaction, and duplicate labels are bracketed into one flagged
 * conflict group instead of two loose warning glyphs.
 *
 * With `defaultProductId` (the product lens) the product scope starts on
 * that product, and while a real product is scoped the results ALSO include
 * workspace-level (null-product) ADRs, marked "Workspace-wide" — a
 * workspace-global decision applies to every product until proven otherwise.
 * The scope chip stays editable so the lens can be widened or pointed at
 * another product.
 */

type AdrRow = RouterOutputs["adr"]["list"][number];
type DecisionRow = RouterOutputs["decision"]["list"][number];

const STATUS_ORDER: LogStatus[] = [
  "ACCEPTED",
  "SUPERSEDED",
  "PROPOSED",
  "OPEN",
  "DEPRECATED",
  "UNKNOWN",
];

const STATUS_META: Record<LogStatus, { label: string; dot: string }> = {
  ACCEPTED: { label: "Accepted", dot: "accepted" },
  SUPERSEDED: { label: "Superseded", dot: "superseded" },
  PROPOSED: { label: "Proposed", dot: "proposed" },
  OPEN: { label: "Open", dot: "open" },
  DEPRECATED: { label: "Deprecated", dot: "deprecated" },
  UNKNOWN: { label: "No status", dot: "unknown" },
};

const SOURCE_ORDER: Array<{ value: LogSource; label: string; icon: ReactNode }> = [
  { value: "code", label: "Code", icon: <IconCode size={12} stroke={1.75} /> },
  { value: "meeting", label: "Meeting", icon: <IconMicrophone size={12} stroke={1.75} /> },
  { value: "manual", label: "Manual", icon: <IconPencil size={12} stroke={1.75} /> },
];

const WORKSPACE_SCOPE = "workspace";

/** `17 Jun 2026` — short, unambiguous, tabular. */
function formatDecided(date: Date | string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Backtick spans in ADR titles render as inline code, without innerHTML. */
function renderTitle(title: string): ReactNode {
  const parts = title.split(/`([^`]+)`/);
  if (parts.length === 1) return title;
  return parts.map((part, i) =>
    i % 2 === 1 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** `owner/name` → de-emphasised owner prefix + name. */
function RepoName({ fullName }: { fullName: string }) {
  const slash = fullName.indexOf("/");
  if (slash === -1) return <>{fullName}</>;
  return (
    <>
      <em>{fullName.slice(0, slash + 1)}</em>
      {fullName.slice(slash + 1)}
    </>
  );
}

function compareRows(a: AdrRow, b: AdrRow): number {
  const repo = a.repository.fullName.localeCompare(b.repository.fullName);
  if (repo !== 0) return repo;
  if (a.number !== b.number) {
    if (a.number === null) return 1;
    if (b.number === null) return -1;
    return a.number - b.number;
  }
  return a.title.localeCompare(b.title);
}

type ListItem =
  | { kind: "row"; adr: AdrRow }
  | { kind: "conflict"; label: string; adrs: AdrRow[] };

/**
 * Consecutive rows (already sorted by repo + number) that share a duplicate
 * label collapse into one conflict item. Conflicts are derived here rather
 * than stored — a label is a label, not a key.
 */
function buildItems(rows: AdrRow[]): ListItem[] {
  const items: ListItem[] = [];
  for (const adr of rows) {
    const last = items[items.length - 1];
    if (adr.isDuplicateLabel && adr.label) {
      if (last?.kind === "conflict" && last.label === adr.label) {
        last.adrs.push(adr);
        continue;
      }
      items.push({ kind: "conflict", label: adr.label, adrs: [adr] });
      continue;
    }
    items.push({ kind: "row", adr });
  }
  // A "conflict" with a single visible member (its twin filtered out) is
  // still a conflict in the repo — keep the bracket so the flag stays honest.
  return items;
}

function countRows(items: ListItem[]): number {
  return items.reduce((n, it) => n + (it.kind === "conflict" ? it.adrs.length : 1), 0);
}

function DecRow({
  adr,
  workspaceSlug,
  showRepo,
}: {
  adr: AdrRow;
  workspaceSlug: string;
  showRepo: boolean;
}) {
  const meta: ReactNode[] = [];
  if (showRepo) {
    meta.push(<span className="dec-meta__repo">{adr.repository.fullName}</span>);
  }
  if (adr.repository.productId === null) {
    meta.push(<span className="dec-meta__ws">Workspace-wide</span>);
  }
  if (adr.supersededBy) {
    meta.push(
      <span className="dec-meta__link">
        Superseded by {adr.supersededBy.label ?? "a later decision"}
      </span>,
    );
  }
  if (adr._count.ticketLinks > 0) {
    meta.push(
      <span className="dec-meta__link">
        <IconPaperclip size={11} stroke={1.75} />
        {adr._count.ticketLinks} linked
      </span>,
    );
  }
  const status = STATUS_META[adr.status];
  const decided = formatDecided(adr.decidedAt);

  return (
    <Link href={`/w/${workspaceSlug}/decisions/${adr.id}`} className="dec-row">
      <span className="dec-label">{adr.label ?? "—"}</span>
      <span className="dec-main">
        <span className="dec-title">{renderTitle(adr.title)}</span>
        {meta.length > 0 ? (
          <span className="dec-meta">
            {meta.map((el, i) => (
              <Fragment key={i}>
                {i > 0 ? <i>·</i> : null}
                {el}
              </Fragment>
            ))}
          </span>
        ) : null}
      </span>
      <span
        className={`dec-status dec-status--${status.dot}`}
        title={adr.statusRaw ?? undefined}
      >
        <span className={`dot dot--${status.dot}`} />
        {status.label}
      </span>
      <span className="dec-date">{decided ?? "—"}</span>
    </Link>
  );
}

/**
 * A Decision row in the same grid as an ADR row. Meta carries what a
 * repository name does for an ADR: where it came from (the meeting, or
 * "logged by hand"), plus the product-lens marker and link counts.
 */
function DecisionLogRow({
  decision,
  workspaceSlug,
  showGroup,
}: {
  decision: DecisionRow;
  workspaceSlug: string;
  showGroup: boolean;
}) {
  const meta: ReactNode[] = [];
  if (decision.source === "MEETING") {
    meta.push(
      <span className="dec-meta__source">
        <IconMicrophone size={11} stroke={1.75} />
        {decision.transcriptionSession?.title ?? "Meeting"}
      </span>,
    );
  } else {
    meta.push(
      <span className="dec-meta__source">
        <IconPencil size={11} stroke={1.75} />
        {decision.source === "AGENT" ? "Logged by Zoe" : "Logged by hand"}
      </span>,
    );
  }
  if (showGroup) {
    const group = decisionGroupOf(decision);
    if (group.kind !== "workspace") meta.push(<span className="dec-meta__ws">{group.name}</span>);
  }
  if (isWorkspaceWide(decision)) {
    meta.push(<span className="dec-meta__ws">Workspace-wide</span>);
  }
  if (decision.supersededBy) {
    meta.push(
      <span className="dec-meta__link">Superseded by {decision.supersededBy.label}</span>,
    );
  }
  if (decision.evidenceCount > 0) {
    meta.push(
      <span className="dec-meta__link">
        <IconQuote size={11} stroke={1.75} />
        {decision.evidenceCount} quoted
      </span>,
    );
  }
  if (decision._count.links > 0) {
    meta.push(
      <span className="dec-meta__link">
        <IconPaperclip size={11} stroke={1.75} />
        {decision._count.links} linked
      </span>,
    );
  }
  const status = STATUS_META[decision.status];
  const decided = formatDecided(decision.decidedAt);

  return (
    <Link
      href={`/w/${workspaceSlug}/decisions/d/${decision.id}`}
      className="dec-row"
      data-kind="decision"
    >
      <span className="dec-label">{decision.label}</span>
      <span className="dec-main">
        <span className="dec-title">{decision.statement}</span>
        {meta.length > 0 ? (
          <span className="dec-meta">
            {meta.map((el, i) => (
              <Fragment key={i}>
                {i > 0 ? <i>·</i> : null}
                {el}
              </Fragment>
            ))}
          </span>
        ) : null}
      </span>
      <span className={`dec-status dec-status--${status.dot}`}>
        <span className={`dot dot--${status.dot}`} />
        {status.label}
      </span>
      <span className="dec-date">{decided ?? "—"}</span>
    </Link>
  );
}

function decisionGroupOf(decision: DecisionRow): LogGroup {
  return decisionToLogRow(decision, "").group;
}

const GROUP_KIND_LABEL: Record<LogGroup["kind"], string> = {
  repository: "Repository",
  ceremony: "Ceremony",
  project: "Project",
  workspace: "",
};

/** Collapsible header shared by repository groups and decision groups. */
function GroupShell({
  name,
  kind,
  count,
  conflicts = 0,
  children,
}: {
  name: ReactNode;
  kind: LogGroup["kind"];
  count: number;
  conflicts?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`dec-group${open ? "" : " closed"}`}>
      <button
        type="button"
        className="dec-group__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <IconChevronDown size={13} stroke={1.75} className="dec-group__chev" />
        <span
          className={`dec-group__name${kind === "repository" ? "" : " dec-group__name--plain"}`}
        >
          {name}
        </span>
        {GROUP_KIND_LABEL[kind] ? (
          <span className="dec-group__kind">{GROUP_KIND_LABEL[kind]}</span>
        ) : null}
        <span className="dec-group__rule" />
        {conflicts > 0 ? (
          <span className="dec-group__flag">
            <IconFlag size={11} stroke={1.75} />
            {conflicts} {conflicts === 1 ? "conflict" : "conflicts"}
          </span>
        ) : null}
        <span className="dec-group__n">{count}</span>
      </button>
      <div className="dec-rows">{children}</div>
    </section>
  );
}

function ConflictHead({ label, count }: { label: string; count: number }) {
  const n = count === 2 ? "Two" : String(count);
  return (
    <div className="dec-conflict__head">
      <IconFlag size={11} stroke={1.75} />
      {count === 1 ? `Another decision claims ${label}` : `${n} decisions claim ${label}`}
    </div>
  );
}

function DecItems({
  items,
  workspaceSlug,
  showRepo,
}: {
  items: ListItem[];
  workspaceSlug: string;
  showRepo: boolean;
}) {
  return (
    <>
      {items.map((it) =>
        it.kind === "conflict" ? (
          <div className="dec-conflict" key={`conflict-${it.adrs[0]!.id}`}>
            <ConflictHead label={it.label} count={it.adrs.length} />
            {it.adrs.map((adr) => (
              <DecRow key={adr.id} adr={adr} workspaceSlug={workspaceSlug} showRepo={showRepo} />
            ))}
          </div>
        ) : (
          <DecRow key={it.adr.id} adr={it.adr} workspaceSlug={workspaceSlug} showRepo={showRepo} />
        ),
      )}
    </>
  );
}

function DecGroup({
  fullName,
  items,
  workspaceSlug,
}: {
  fullName: string;
  items: ListItem[];
  workspaceSlug: string;
}) {
  const count = countRows(items);
  const conflicts = items.filter((it) => it.kind === "conflict").length;
  return (
    <GroupShell
      name={<RepoName fullName={fullName} />}
      kind="repository"
      count={count}
      conflicts={conflicts}
    >
      <DecItems items={items} workspaceSlug={workspaceSlug} showRepo={false} />
    </GroupShell>
  );
}

interface ScopeOption {
  value: string;
  label: string;
}

/**
 * The product scope, as a chip rather than a boxed select. Scoped: the
 * product name with a menu to re-point and an × to widen to the whole
 * workspace. Unscoped: a quiet "All products" menu trigger.
 */
function ProductScopeChip({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: ScopeOption[];
  onChange: (value: string | null) => void;
}) {
  const current = options.find((o) => o.value === value);
  const dropdown = (
    <Menu.Dropdown>
      {options.map((o) => (
        <Menu.Item key={o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Menu.Item>
      ))}
    </Menu.Dropdown>
  );

  if (!value) {
    return (
      <Menu shadow="md" width={240} position="bottom-end">
        <Menu.Target>
          <button type="button" className="dec-scope dec-scope--off" aria-label="Scope to a product">
            All products
            <IconChevronDown size={12} stroke={1.75} />
          </button>
        </Menu.Target>
        {dropdown}
      </Menu>
    );
  }

  return (
    <span className="dec-scope">
      <Menu shadow="md" width={240} position="bottom-end">
        <Menu.Target>
          <button type="button" className="dec-scope__pick" aria-label="Change product scope">
            <b>{current?.label ?? "Product"}</b>
            <IconChevronDown size={12} stroke={1.75} />
          </button>
        </Menu.Target>
        {dropdown}
      </Menu>
      <button
        type="button"
        className="dec-scope__clear"
        aria-label="Clear product scope"
        onClick={() => onChange(null)}
      >
        <IconX size={12} stroke={1.75} />
      </button>
    </span>
  );
}

interface DecisionsIndexProps {
  workspaceId: string;
  workspaceSlug: string;
  /** Page sub-copy under the "Decisions" heading. */
  description: ReactNode;
  /** Where "Open graph" goes (workspace or product graph). */
  graphHref: string;
  /**
   * Start the product scope on this product (the product Decisions lens).
   * While a real product is scoped, workspace-wide ADRs are included too.
   */
  defaultProductId?: string;
}

export function DecisionsIndex({
  workspaceId,
  workspaceSlug,
  description,
  graphHref,
  defaultProductId,
}: DecisionsIndexProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LogStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LogSource | "all">("all");
  const [grouped, setGrouped] = useState(true);
  const [productFilter, setProductFilter] = useState<string | null>(
    defaultProductId ?? null,
  );
  // "New decision" is the manual create path (ADR-0060). Viewers and guests
  // read the log but the create mutation gates at workspace edit, so the
  // button hides for them rather than failing on click.
  const { userRole } = useWorkspace();
  const canCreate =
    userRole !== null && hasMinimumWorkspaceRole(userRole, WORKSPACE_PERMISSION_MAP.edit);
  const [newDecisionOpen, setNewDecisionOpen] = useState(false);

  const query = search.trim();
  const q = query.toLowerCase();
  // Label + title match instantly on the client; body matches arrive from
  // the server after a short debounce and are unioned in.
  const [debouncedQuery] = useDebouncedValue(query, 150);

  // Only the product lens folds workspace-wide ADRs into a product scope;
  // the workspace page keeps its product scope exact.
  const includeWorkspaceWide =
    !!defaultProductId && !!productFilter && productFilter !== WORKSPACE_SCOPE;

  const listInput = {
    workspaceId,
    productId: productFilter ?? undefined,
    includeWorkspaceWide: includeWorkspaceWide || undefined,
  };

  const {
    data: adrs,
    isLoading: adrsLoading,
    error: adrsError,
  } = api.adr.list.useQuery(listInput, { enabled: !!workspaceId });

  const { data: bodyMatches } = api.adr.list.useQuery(
    { ...listInput, search: debouncedQuery },
    { enabled: !!workspaceId && debouncedQuery.length > 0 },
  );
  const {
    data: decisions,
    isLoading: decisionsLoading,
    error: decisionsError,
  } = api.decision.list.useQuery(listInput, { enabled: !!workspaceId });

  const { data: decisionBodyMatches } = api.decision.list.useQuery(
    { ...listInput, search: debouncedQuery },
    { enabled: !!workspaceId && debouncedQuery.length > 0 },
  );
  const bodyMatchIds = useMemo(
    () =>
      new Set([
        ...(bodyMatches ?? []).map((a) => a.id),
        ...(decisionBodyMatches ?? []).map((d) => d.id),
      ]),
    [bodyMatches, decisionBodyMatches],
  );

  const { data: configs } = api.adr.listConfigs.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );
  const { data: products } = api.product.product.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  const scopeOptions = useMemo<ScopeOption[]>(
    () => [
      ...(products ?? []).map((p) => ({ value: p.id, label: p.name })),
      { value: WORKSPACE_SCOPE, label: "Workspace-level (no product)" },
    ],
    [products],
  );

  // Decisions as merged log rows; ADRs keep their own pipeline below because
  // the conflict bracketing needs the full ADR row.
  const decisionLogRows = useMemo(
    () => (decisions ?? []).map((d) => decisionToLogRow(d, workspaceSlug)),
    [decisions, workspaceSlug],
  );
  const decisionById = useMemo(
    () => new Map((decisions ?? []).map((d) => [d.id, d])),
    [decisions],
  );

  const sourceCounts = useMemo(() => {
    const c = new Map<LogSource, number>();
    c.set("code", adrs?.length ?? 0);
    for (const row of decisionLogRows) c.set(row.source, (c.get(row.source) ?? 0) + 1);
    return c;
  }, [adrs, decisionLogRows]);

  // Status counts follow the Source facet so the numbers match the list.
  const counts = useMemo(() => {
    const c = new Map<LogStatus, number>();
    if (sourceFilter === "all" || sourceFilter === "code") {
      for (const adr of adrs ?? []) c.set(adr.status, (c.get(adr.status) ?? 0) + 1);
    }
    for (const row of decisionLogRows) {
      if (sourceFilter !== "all" && row.source !== sourceFilter) continue;
      c.set(row.status, (c.get(row.status) ?? 0) + 1);
    }
    return c;
  }, [adrs, decisionLogRows, sourceFilter]);
  const totalCount =
    (sourceFilter === "all" || sourceFilter === "code" ? (adrs?.length ?? 0) : 0) +
    decisionLogRows.filter((r) => sourceFilter === "all" || r.source === sourceFilter).length;

  const visible = useMemo(() => {
    if (sourceFilter !== "all" && sourceFilter !== "code") return [];
    const rows = (adrs ?? []).filter((adr) => {
      if (statusFilter !== "all" && adr.status !== statusFilter) return false;
      if (!q) return true;
      return (
        `${adr.label ?? ""} ${adr.title}`.toLowerCase().includes(q) ||
        bodyMatchIds.has(adr.id)
      );
    });
    return [...rows].sort(compareRows);
  }, [adrs, statusFilter, sourceFilter, q, bodyMatchIds]);

  const visibleDecisions = useMemo(
    () =>
      sourceFilter === "code"
        ? []
        : filterLogRows(decisionLogRows, {
            source: sourceFilter,
            status: statusFilter,
            query: q,
            bodyMatchIds,
          }),
    [decisionLogRows, sourceFilter, statusFilter, q, bodyMatchIds],
  );
  const decisionGroups = useMemo(() => groupLogRows(visibleDecisions), [visibleDecisions]);

  const groups = useMemo(() => {
    const byRepo = new Map<string, { fullName: string; rows: AdrRow[] }>();
    for (const adr of visible) {
      const g = byRepo.get(adr.repositoryId) ?? {
        fullName: adr.repository.fullName,
        rows: [],
      };
      g.rows.push(adr);
      byRepo.set(adr.repositoryId, g);
    }
    return [...byRepo.entries()].map(([repositoryId, g]) => ({
      repositoryId,
      fullName: g.fullName,
      items: buildItems(g.rows),
    }));
  }, [visible]);

  const flatItems = useMemo(() => buildItems(visible), [visible]);

  // Grouped headers make cross-repo result sets harder to read, so a live
  // query forces Flat. The toggle keeps its own state and snaps back.
  const effectiveGrouped = grouped && !q;

  // "Filtered" relative to the page's default view — the product lens's
  // starting product doesn't count, so its true-empty state still shows the
  // enrolment CTA rather than "no match".
  const scopeChanged = productFilter !== (defaultProductId ?? null);
  const noDecisionsAtAll = (!adrs || adrs.length === 0) && decisionLogRows.length === 0;
  const isLoading = adrsLoading || decisionsLoading;
  const loadError = adrsError ?? decisionsError;
  const nothingVisible = visible.length === 0 && visibleDecisions.length === 0;

  const scopedConfigs = useMemo(() => {
    const all = configs ?? [];
    if (!productFilter) return all;
    return all.filter((c) =>
      productFilter === WORKSPACE_SCOPE
        ? c.repository.productId === null
        : c.repository.productId === productFilter ||
          (includeWorkspaceWide && c.repository.productId === null),
    );
  }, [configs, productFilter, includeWorkspaceWide]);

  const lastSyncedAt = useMemo(() => {
    let latest: Date | null = null;
    for (const c of scopedConfigs) {
      if (!c.lastSyncedAt) continue;
      const d = new Date(c.lastSyncedAt);
      if (!latest || d > latest) latest = d;
    }
    return latest;
  }, [scopedConfigs]);

  const repoCount = scopedConfigs.length;
  const repoWord = repoCount === 1 ? "repository" : "repositories";

  return (
    <div className="dec-surface">
      <div className="dec-canvas">
        <div className="dec-head">
          <div className="dec-head__main">
            <h2>Decisions</h2>
            <div className="dec-head__sub">{description}</div>
          </div>
          <Link href={graphHref} className="dec-ghost">
            <IconAffiliate size={14} stroke={1.75} />
            Open graph
          </Link>
          {canCreate ? (
            <button
              type="button"
              className="dec-primary"
              onClick={() => setNewDecisionOpen(true)}
            >
              <IconPlus size={14} stroke={1.75} />
              New decision
            </button>
          ) : null}
        </div>
        {canCreate ? (
          <LogDecisionModal
            opened={newDecisionOpen}
            onClose={() => setNewDecisionOpen(false)}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            productId={defaultProductId ?? null}
          />
        ) : null}

        <div className="dec-bar">
          <label className="dec-search">
            <IconSearch size={14} stroke={1.75} />
            <input
              type="search"
              placeholder="Search decisions"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              aria-label="Search decisions"
            />
          </label>
          <div className="dec-seg" role="group" aria-label="Filter by status">
            <button
              type="button"
              className={statusFilter === "all" ? "on" : ""}
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            >
              All <span className="dec-seg__n">{totalCount}</span>
            </button>
            {/* Zero-count statuses hide, except the active one — a filter
                that is still applied must stay visible and clearable. */}
            {STATUS_ORDER.filter(
              (s) => (counts.get(s) ?? 0) > 0 || statusFilter === s,
            ).map((s) => (
              <button
                key={s}
                type="button"
                className={statusFilter === s ? "on" : ""}
                aria-pressed={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              >
                <span className={`dot dot--${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}{" "}
                <span className="dec-seg__n">{counts.get(s) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="dec-seg" role="group" aria-label="Filter by source">
            <button
              type="button"
              className={sourceFilter === "all" ? "on" : ""}
              aria-pressed={sourceFilter === "all"}
              onClick={() => setSourceFilter("all")}
            >
              All sources
            </button>
            {SOURCE_ORDER.filter(
              (s) => (sourceCounts.get(s.value) ?? 0) > 0 || sourceFilter === s.value,
            ).map((s) => (
              <button
                key={s.value}
                type="button"
                className={sourceFilter === s.value ? "on" : ""}
                aria-pressed={sourceFilter === s.value}
                onClick={() => setSourceFilter(s.value)}
              >
                {s.icon}
                {s.label} <span className="dec-seg__n">{sourceCounts.get(s.value) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="dec-bar__spacer" />
          <ProductScopeChip
            value={productFilter}
            options={scopeOptions}
            onChange={setProductFilter}
          />
          <div className="dec-seg" role="group" aria-label="Grouping">
            <button
              type="button"
              className={grouped ? "on" : ""}
              aria-pressed={grouped}
              onClick={() => setGrouped(true)}
            >
              <IconFolder size={12} stroke={1.75} />
              Grouped
            </button>
            <button
              type="button"
              className={!grouped ? "on" : ""}
              aria-pressed={!grouped}
              onClick={() => setGrouped(false)}
            >
              <IconList size={12} stroke={1.75} />
              Flat
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="dec-skeleton" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={34} radius="sm" />
            ))}
          </div>
        ) : loadError ? (
          <div className="dec-empty">
            <b>Couldn&apos;t load decisions</b>
            {loadError.data?.code === "FORBIDDEN"
              ? "Decisions are visible to workspace members only."
              : loadError.message}
          </div>
        ) : noDecisionsAtAll && !scopeChanged ? (
          <div className="dec-empty">
            <b>No decisions yet</b>
            {canCreate ? "Log one with New decision or from a meeting's summary tab, " : "Decisions are logged from a meeting's summary tab, "}
            or enrol repositories under{" "}
            <Link href={`/w/${workspaceSlug}/settings/decisions`}>Settings → Decisions</Link>
            {" "}to sync ADRs.
          </div>
        ) : nothingVisible ? (
          <div className="dec-empty">
            <b>No decisions match</b>
            Try a different status or source, or clear the search.
          </div>
        ) : effectiveGrouped ? (
          <>
            {groups.map((g) => (
              <DecGroup
                key={g.repositoryId}
                fullName={g.fullName}
                items={g.items}
                workspaceSlug={workspaceSlug}
              />
            ))}
            {decisionGroups.map((g) => (
              <GroupShell
                key={g.group.key}
                name={g.group.name}
                kind={g.group.kind}
                count={g.rows.length}
              >
                {g.rows.map((row) => {
                  const decision = decisionById.get(row.id);
                  return decision ? (
                    <DecisionLogRow
                      key={row.id}
                      decision={decision}
                      workspaceSlug={workspaceSlug}
                      showGroup={false}
                    />
                  ) : null;
                })}
              </GroupShell>
            ))}
          </>
        ) : (
          <div className="dec-rows dec-rows--flat">
            <DecItems items={flatItems} workspaceSlug={workspaceSlug} showRepo />
            {visibleDecisions.map((row) => {
              const decision = decisionById.get(row.id);
              return decision ? (
                <DecisionLogRow
                  key={row.id}
                  decision={decision}
                  workspaceSlug={workspaceSlug}
                  showGroup
                />
              ) : null;
            })}
          </div>
        )}

        {configs ? (
          <div className="dec-foot">
            <IconClock size={12} stroke={1.75} />
            {lastSyncedAt
              ? `Synced from git ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`
              : "Not synced from git yet"}
            {" · "}
            {repoCount} {repoWord} {lastSyncedAt ? "scanned" : "enrolled"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
