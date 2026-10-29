import type { TicketStatus, TicketType } from "@prisma/client";

/**
 * Cycle changelog — "what shipped in Cycle N", grouped into Features / Fixes /
 * Under the hood / Also this cycle and ordered from the largest piece of work
 * to the smallest.
 *
 * Deterministic and pure: the same tickets and pull requests always produce the
 * same changelog, so it renders live with no stored state. Two sources feed it:
 *
 *   - the cycle's finished Tickets (their points are the planned size), and
 *   - the pull requests merged inside the cycle's dates (their count is the
 *     shipped size — a 3-point ticket can take thirteen PRs).
 *
 * A PR is attached to a Ticket when the Ticket names it (`prUrl`) or shares its
 * branch. Everything else is grouped by its conventional-commit scope, so
 * `feat(signals): …` and `fix(signals): …` land together rather than as two
 * dozen one-line entries.
 */

/** Most cycles the change-log page loads at once ("Show older cycles" stops here). */
export const CHANGELOG_MAX_CYCLES = 24;

export interface ChangelogTicket {
  id: string;
  number: number | null;
  shortId: string | null;
  title: string;
  type: TicketType;
  status: TicketStatus;
  points: number | null;
  featureId: string | null;
  featureName: string | null;
  prUrl: string | null;
  branchName: string | null;
  /** Markdown body — loaded only for the LLM draft, which reads it for context. */
  body?: string | null;
}

export interface ChangelogPullRequest {
  repoFullName: string;
  prNumber: number | null;
  title: string;
  url: string | null;
  branchName: string | null;
  author: string | null;
  mergedAt: Date;
}

export type ChangelogSectionKey =
  | "features"
  | "fixes"
  | "underTheHood"
  | "alsoThisCycle";

export const CHANGELOG_SECTIONS: { key: ChangelogSectionKey; label: string }[] =
  [
    { key: "features", label: "Features" },
    { key: "fixes", label: "Fixes" },
    { key: "underTheHood", label: "Under the hood" },
    { key: "alsoThisCycle", label: "Also this cycle" },
  ];

export const CHANGELOG_SECTION_KEYS = [
  "features",
  "fixes",
  "underTheHood",
  "alsoThisCycle",
] as const satisfies readonly ChangelogSectionKey[];

export type ChangelogItem =
  | {
      kind: "ticket";
      id: string;
      title: string;
      shortId: string | null;
      number: number | null;
      points: number | null;
    }
  | {
      kind: "pull_request";
      id: string;
      title: string;
      url: string | null;
      repoName: string;
      prNumber: number | null;
    };

export interface ChangelogEntry {
  key: string;
  title: string;
  section: ChangelogSectionKey;
  points: number;
  pullRequestCount: number;
  /** Ordering weight: planned size (points) plus shipped size (merged PRs). */
  size: number;
  items: ChangelogItem[];
}

export interface CycleChangelog {
  sections: {
    key: ChangelogSectionKey;
    label: string;
    entries: ChangelogEntry[];
  }[];
  totals: { tickets: number; points: number; pullRequests: number };
}

/** A Ticket counts as shipped once it reaches DONE or DEPLOYED. */
const SHIPPED_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  "DONE",
  "DEPLOYED",
]);

const PR_TITLE_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

const SECTION_BY_PREFIX: Record<string, ChangelogSectionKey> = {
  feat: "features",
  perf: "features",
  fix: "fixes",
  docs: "underTheHood",
  refactor: "underTheHood",
  style: "underTheHood",
  test: "underTheHood",
  chore: "underTheHood",
  ci: "underTheHood",
  build: "underTheHood",
};

/**
 * Split a PR title into its conventional-commit parts. A title with no
 * recognised prefix is treated as a feature — PRs titled in plain English
 * ("Redesign the Analysis page") are nearly always user-facing work.
 */
export function parsePullRequestTitle(title: string): {
  section: ChangelogSectionKey;
  scope: string | null;
  text: string;
} {
  const match = PR_TITLE_RE.exec(title.trim());
  const prefix = match?.[1]?.toLowerCase();
  if (match && prefix && prefix in SECTION_BY_PREFIX) {
    return {
      section: SECTION_BY_PREFIX[prefix]!,
      scope: match[2]?.trim().toLowerCase() ?? null,
      text: capitalize(match[3]!.trim()),
    };
  }
  return { section: "features", scope: null, text: capitalize(title.trim()) };
}

/**
 * Release plumbing that says nothing about what shipped: environment syncs
 * ("Sync prod with dev") and merge-up PRs.
 */
export function isReleasePlumbing(title: string): boolean {
  return /^(sync|merge)\b/i.test(title.trim());
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function humanizeScope(scope: string): string {
  return capitalize(scope.replace(/[-_/]+/g, " "));
}

function repoName(repoFullName: string): string {
  return repoFullName.split("/")[1] ?? repoFullName;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function sectionForTickets(tickets: ChangelogTicket[]): ChangelogSectionKey {
  const types = new Set(tickets.map((t) => t.type));
  if (types.has("FEATURE") || types.has("IMPROVEMENT")) return "features";
  if (types.has("BUG")) return "fixes";
  if (types.has("CHORE")) return "underTheHood";
  return "alsoThisCycle";
}

function pullRequestItem(pr: ChangelogPullRequest): ChangelogItem {
  return {
    kind: "pull_request",
    id: `${pr.repoFullName}#${pr.prNumber ?? pr.url ?? pr.title}`,
    title: parsePullRequestTitle(pr.title).text,
    url: pr.url,
    repoName: repoName(pr.repoFullName),
    prNumber: pr.prNumber,
  };
}

export function ticketItem(ticket: ChangelogTicket): ChangelogItem {
  return {
    kind: "ticket",
    id: ticket.id,
    title: ticket.title,
    shortId: ticket.shortId,
    number: ticket.number,
    points: ticket.points,
  };
}

/** Drop duplicate PR rows (one webhook per event can store a PR more than once). */
function dedupePullRequests(
  pullRequests: ChangelogPullRequest[],
): ChangelogPullRequest[] {
  const seen = new Map<string, ChangelogPullRequest>();
  for (const pr of pullRequests) {
    const key = `${pr.repoFullName}#${pr.prNumber ?? pr.url ?? pr.title}`;
    const existing = seen.get(key);
    if (!existing || pr.mergedAt > existing.mergedAt) seen.set(key, pr);
  }
  return [...seen.values()];
}

export function buildCycleChangelog(input: {
  tickets: ChangelogTicket[];
  pullRequests: ChangelogPullRequest[];
  /**
   * Fold long sections' lone PRs into "N smaller changes" (default true).
   * The LLM draft turns this off so it can merge those PRs into themes.
   */
  foldSmallChanges?: boolean;
}): CycleChangelog {
  const fold = input.foldSmallChanges ?? true;
  const tickets = input.tickets.filter((t) => SHIPPED_STATUSES.has(t.status));
  const pullRequests = dedupePullRequests(input.pullRequests)
    .filter((pr) => !isReleasePlumbing(pr.title))
    .sort((a, b) => a.mergedAt.getTime() - b.mergedAt.getTime());

  const ticketByUrl = new Map<string, ChangelogTicket>();
  const ticketByBranch = new Map<string, ChangelogTicket>();
  for (const ticket of tickets) {
    if (ticket.prUrl) ticketByUrl.set(normalizeUrl(ticket.prUrl), ticket);
    if (ticket.branchName) ticketByBranch.set(ticket.branchName, ticket);
  }

  const prsByTicket = new Map<string, ChangelogPullRequest[]>();
  const unlinked: ChangelogPullRequest[] = [];
  for (const pr of pullRequests) {
    const ticket =
      (pr.url ? ticketByUrl.get(normalizeUrl(pr.url)) : undefined) ??
      (pr.branchName ? ticketByBranch.get(pr.branchName) : undefined);
    if (ticket) {
      const list = prsByTicket.get(ticket.id) ?? [];
      list.push(pr);
      prsByTicket.set(ticket.id, list);
    } else {
      unlinked.push(pr);
    }
  }

  const entries: ChangelogEntry[] = [];

  // Tickets: one entry per Feature, and one per Ticket that has no Feature.
  const ticketGroups = new Map<string, { title: string; tickets: ChangelogTicket[] }>();
  for (const ticket of tickets) {
    const key =
      ticket.featureId && ticket.featureName
        ? `feature:${ticket.featureId}`
        : `ticket:${ticket.id}`;
    const group = ticketGroups.get(key) ?? {
      title: ticket.featureName && ticket.featureId ? ticket.featureName : ticket.title,
      tickets: [],
    };
    group.tickets.push(ticket);
    ticketGroups.set(key, group);
  }
  for (const [key, group] of ticketGroups) {
    const groupTickets = [...group.tickets].sort(
      (a, b) => (b.points ?? 0) - (a.points ?? 0) || a.title.localeCompare(b.title),
    );
    const prs = groupTickets.flatMap((t) => prsByTicket.get(t.id) ?? []);
    const points = groupTickets.reduce((sum, t) => sum + (t.points ?? 0), 0);
    const isFeatureGroup = key.startsWith("feature:");
    entries.push({
      key,
      title: group.title,
      section: sectionForTickets(groupTickets),
      points,
      pullRequestCount: prs.length,
      size: points + prs.length,
      // A ticket-only entry is titled by its ticket, so listing it again
      // underneath would just repeat the heading.
      items: [
        ...(isFeatureGroup ? groupTickets.map(ticketItem) : []),
        ...prs.map(pullRequestItem),
      ],
    });
  }

  // Unlinked PRs: grouped by section + scope (or by repo when unscoped).
  const prGroups = new Map<
    string,
    { section: ChangelogSectionKey; label: string; prs: ChangelogPullRequest[] }
  >();
  for (const pr of unlinked) {
    const { section, scope } = parsePullRequestTitle(pr.title);
    const label = scope ? humanizeScope(scope) : repoName(pr.repoFullName);
    const key = `prs:${section}:${scope ?? `repo:${pr.repoFullName}`}`;
    const group = prGroups.get(key) ?? { section, label, prs: [] };
    group.prs.push(pr);
    prGroups.set(key, group);
  }
  for (const [key, group] of prGroups) {
    const single = group.prs.length === 1 ? group.prs[0] : undefined;
    entries.push({
      key,
      // A lone PR reads best under its own title; a group under its scope.
      title: single ? parsePullRequestTitle(single.title).text : group.label,
      section: group.section,
      points: 0,
      pullRequestCount: group.prs.length,
      size: group.prs.length,
      items: group.prs.map(pullRequestItem),
    });
  }

  entries.sort((a, b) => b.size - a.size || a.title.localeCompare(b.title));

  return {
    sections: CHANGELOG_SECTIONS.map(({ key, label }) => ({
      key,
      label,
      entries: fold
        ? foldSmallChanges(key, entries.filter((e) => e.section === key))
        : entries.filter((e) => e.section === key),
    })).filter((s) => s.entries.length > 0),
    totals: {
      tickets: tickets.length,
      points: tickets.reduce((sum, t) => sum + (t.points ?? 0), 0),
      pullRequests: pullRequests.length,
    },
  };
}

/** A section longer than this folds its one-PR entries into a single row. */
export const SMALL_CHANGES_THRESHOLD = 8;

/**
 * A busy cycle produces dozens of one-PR entries that bury the real work. Past
 * {@link SMALL_CHANGES_THRESHOLD} entries, the lone PRs (no ticket, one PR)
 * fold into a single "N smaller changes" row at the bottom of the section.
 */
function foldSmallChanges(
  section: ChangelogSectionKey,
  entries: ChangelogEntry[],
): ChangelogEntry[] {
  if (entries.length <= SMALL_CHANGES_THRESHOLD) return entries;
  const isSmall = (e: ChangelogEntry) =>
    e.key.startsWith("prs:") && e.pullRequestCount === 1;
  const small = entries.filter(isSmall);
  if (small.length < 2) return entries;
  return [
    ...entries.filter((e) => !isSmall(e)),
    {
      key: `small:${section}`,
      title: `${small.length} smaller changes`,
      section,
      points: 0,
      pullRequestCount: small.length,
      size: small.length,
      items: small.flatMap((e) => e.items),
    },
  ];
}

export interface ChangelogCycleWindow {
  id: string;
  startDate: Date;
  endDate: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Give each merged PR to exactly one cycle. A cycle covers its start date up to
 * the end of its end date; where windows overlap (a cycle ending on the day the
 * next one starts), the later-starting cycle wins, so no PR is counted twice.
 */
export function assignPullRequestsToCycles<T extends { mergedAt: Date }>(
  cycles: ChangelogCycleWindow[],
  pullRequests: T[],
): Map<string, T[]> {
  const byStart = [...cycles].sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  );
  const result = new Map<string, T[]>(cycles.map((c) => [c.id, []]));
  for (const pr of pullRequests) {
    const at = pr.mergedAt.getTime();
    const cycle = byStart.find(
      (c) => at >= c.startDate.getTime() && at < c.endDate.getTime() + DAY_MS,
    );
    if (cycle) result.get(cycle.id)!.push(pr);
  }
  return result;
}
