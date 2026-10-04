/**
 * Loads and shapes the data for the product Overview "manager view"
 * (`product.getManagerOverview`). Reads only existing tables - the burn-up,
 * stage ages and PR state are derived (see ./managerOverview.ts for the
 * derivation notes and their limits).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { TicketStatus } from "~/lib/ticket-statuses";
import { ticketDisplayId, ticketUrlId } from "~/lib/fun-ids";
import { currentCycleOrder, currentCycleWhere } from "./currentCycle";
import {
  WINDOW_DAYS,
  computeBurnup,
  computeCriticalPath,
  computeWaitingOn,
  findBottleneck,
  isSlipping,
  median,
  MIN_CYCLE_TIME_SAMPLES,
  parsePrUrl,
  stageOf,
  summarizeStages,
  weeklyCompleted,
  type StageKey,
} from "./managerOverview";

const DAY = 86_400_000;
const PR_HISTORY_DAYS = 60;
const OPEN_STATUSES: TicketStatus[] = [
  "BACKLOG",
  "NEEDS_REFINEMENT",
  "READY_TO_PLAN",
  "COMMITTED",
  "IN_PROGRESS",
  "BLOCKED",
  "QA",
];

interface ProductRef {
  id: string;
  name: string;
  workspaceId: string;
  funTicketIds: boolean;
}

const ticketSelect = {
  id: true,
  number: true,
  shortId: true,
  title: true,
  status: true,
  points: true,
  prUrl: true,
  cycleId: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  assignee: { select: { id: true, name: true, image: true, isAgent: true } },
  feature: { select: { name: true, area: { select: { name: true } } } },
} satisfies Prisma.TicketSelect;

type LoadedTicket = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

export type PrState = "open" | "approved" | "changes" | "merged" | "closed";

interface PrInfo {
  url: string;
  repo: string;
  number: number;
  title: string | null;
  author: string | null;
  state: PrState;
  /** Latest submitted review, if any. */
  reviewed: boolean;
  openedAt: Date | null;
  mergedAt: Date | null;
}

/** Folds GitHub webhook rows (one per PR event / review) into PR state. */
function foldPrEvents(
  rows: {
    eventType: string;
    eventAction: string | null;
    prUrl: string | null;
    prNumber: number | null;
    prTitle: string | null;
    prState: string | null;
    prAuthor: string | null;
    prMergedAt: Date | null;
    prReviewState: string | null;
    repoFullName: string;
    eventTimestamp: Date;
  }[],
): Map<string, PrInfo> {
  const byUrl = new Map<string, PrInfo>();
  // Oldest first so later events win.
  const sorted = [...rows].sort(
    (a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime(),
  );
  for (const r of sorted) {
    if (!r.prUrl) continue;
    const parsed = parsePrUrl(r.prUrl);
    const pr: PrInfo = byUrl.get(r.prUrl) ?? {
      url: r.prUrl,
      repo: parsed?.repo ?? r.repoFullName,
      number: r.prNumber ?? parsed?.number ?? 0,
      title: null,
      author: null,
      state: "open",
      reviewed: false,
      openedAt: null,
      mergedAt: null,
    };
    pr.title = r.prTitle ?? pr.title;
    pr.author = pr.author ?? r.prAuthor;
    if (r.eventType === "pull_request") {
      if (r.eventAction === "opened") pr.openedAt = r.eventTimestamp;
      pr.openedAt ??= r.eventTimestamp;
      if (r.prState === "merged" || r.prMergedAt) {
        pr.state = "merged";
        pr.mergedAt = r.prMergedAt ?? r.eventTimestamp;
      } else if (r.prState === "closed") {
        pr.state = "closed";
      } else if (pr.state === "closed" || pr.state === "merged") {
        pr.state = "open"; // reopened
      }
    } else if (r.eventType === "pull_request_review" && pr.state !== "merged" && pr.state !== "closed") {
      const s = r.prReviewState?.toLowerCase();
      if (s === "approved") {
        pr.state = "approved";
        pr.reviewed = true;
      } else if (s === "changes_requested") {
        pr.state = "changes";
        pr.reviewed = true;
      } else if (s === "commented") {
        pr.reviewed = true;
      }
    }
    byUrl.set(r.prUrl, pr);
  }
  return byUrl;
}

export async function loadManagerOverview(
  db: PrismaClient,
  product: ProductRef,
  now: Date,
) {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const cycleWhere = currentCycleWhere(product.workspaceId, now);
  const cycleSelect = { id: true, name: true, startDate: true, endDate: true };

  const [
    ownCycle,
    sharedCycle,
    openTickets,
    recentCompleted,
    completedLast12Weeks,
    shippedScopes,
    linkedRepos,
    totalTickets,
    otherCounts,
  ] = await Promise.all([
    db.list.findFirst({
      where: {
        AND: [
          cycleWhere,
          {
            OR: [
              { productId: product.id },
              { tickets: { some: { productId: product.id } } },
            ],
          },
        ],
      },
      orderBy: currentCycleOrder,
      select: cycleSelect,
    }),
    db.list.findFirst({
      where: { ...cycleWhere, productId: null },
      orderBy: currentCycleOrder,
      select: cycleSelect,
    }),
    db.ticket.findMany({
      where: { productId: product.id, status: { in: OPEN_STATUSES } },
      select: ticketSelect,
    }),
    db.ticket.findMany({
      where: {
        productId: product.id,
        status: { in: ["DONE", "DEPLOYED"] },
        completedAt: { gte: windowStart },
      },
      select: ticketSelect,
    }),
    db.ticket.findMany({
      where: {
        productId: product.id,
        status: { in: ["DONE", "DEPLOYED"] },
        completedAt: { gte: new Date(now.getTime() - 84 * DAY) },
      },
      select: { id: true, completedAt: true },
    }),
    db.featureScope.findMany({
      where: {
        feature: { productId: product.id },
        shippedAt: { gte: windowStart },
      },
      orderBy: { shippedAt: "desc" },
      select: { version: true, feature: { select: { name: true } } },
    }),
    db.workspaceRepository.findMany({
      where: { productId: product.id },
      select: { fullName: true },
    }),
    db.ticket.count({ where: { productId: product.id } }),
    db.product.findUnique({
      where: { id: product.id },
      select: {
        _count: { select: { features: true, researches: true, retrospectives: true } },
      },
    }),
  ]);

  const cycle = ownCycle ?? sharedCycle;
  const firstRun =
    totalTickets === 0 &&
    (otherCounts?._count.features ?? 0) === 0 &&
    (otherCounts?._count.researches ?? 0) === 0 &&
    (otherCounts?._count.retrospectives ?? 0) === 0;

  // Scope of the flow/team sections: the cycle's tickets when there is a
  // cycle, else everything open in the product (plus recent completions).
  const cycleTickets = cycle
    ? await db.ticket.findMany({
        where: { productId: product.id, cycleId: cycle.id },
        select: ticketSelect,
      })
    : [];
  const scoped: LoadedTicket[] = cycle
    ? cycleTickets.filter((t) => t.status !== "ARCHIVED")
    : [
        ...openTickets.filter((t) => t.status !== "BACKLOG" && t.status !== "NEEDS_REFINEMENT"),
        ...recentCompleted,
      ];

  const scopedIds = scoped.map((t) => t.id);
  const cycleTimeIds = completedLast12Weeks.map((t) => t.id);
  const eventIds = [...new Set([...scopedIds, ...cycleTimeIds])];
  const openIds = openTickets.map((t) => t.id);
  const repoNames = linkedRepos.map((r) => r.fullName);
  const ticketPrUrls = [...openTickets, ...scoped]
    .map((t) => t.prUrl)
    .filter((u): u is string => !!u);

  const [events, deps, prRows] = await Promise.all([
    eventIds.length
      ? db.workspaceActivityEvent.findMany({
          where: {
            workspaceId: product.workspaceId,
            entityType: "ticket",
            entityId: { in: eventIds },
            action: { in: ["status_changed", "updated", "created"] },
          },
          orderBy: { createdAt: "asc" },
          select: { entityId: true, action: true, metadata: true, createdAt: true },
        })
      : Promise.resolve([]),
    openIds.length
      ? db.ticketDependency.findMany({
          where: { ticketId: { in: openIds }, dependsOnId: { in: openIds } },
          select: { ticketId: true, dependsOnId: true },
        })
      : Promise.resolve([]),
    repoNames.length || ticketPrUrls.length
      ? db.gitHubActivity.findMany({
          where: {
            workspaceId: product.workspaceId,
            eventType: { in: ["pull_request", "pull_request_review"] },
            eventTimestamp: { gte: new Date(now.getTime() - PR_HISTORY_DAYS * DAY) },
            OR: [
              ...(repoNames.length ? [{ repoFullName: { in: repoNames } }] : []),
              ...(ticketPrUrls.length ? [{ prUrl: { in: ticketPrUrls } }] : []),
            ],
          },
          select: {
            eventType: true,
            eventAction: true,
            prUrl: true,
            prNumber: true,
            prTitle: true,
            prState: true,
            prAuthor: true,
            prMergedAt: true,
            prReviewState: true,
            repoFullName: true,
            eventTimestamp: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const prs = foldPrEvents(prRows);
  const hasPrData = prRows.length > 0;

  // ---- time each ticket entered its current status / the cycle ----
  const statusSince = new Map<string, Date>();
  const cycleJoinedAt = new Map<string, Date>();
  const startedAt = new Map<string, Date>();
  for (const e of events) {
    const meta = (e.metadata ?? {}) as { to?: string; fieldsChanged?: string[] };
    if (e.action === "status_changed" && meta.to) {
      statusSince.set(`${e.entityId}:${meta.to}`, e.createdAt);
      if (meta.to === "IN_PROGRESS" && !startedAt.has(e.entityId)) {
        startedAt.set(e.entityId, e.createdAt);
      }
    } else if (e.action === "updated" && meta.fieldsChanged?.includes("cycleId")) {
      cycleJoinedAt.set(e.entityId, e.createdAt);
    }
  }

  const ref = (t: LoadedTicket) => ({
    id: t.id,
    urlId: ticketUrlId(t),
    displayId: ticketDisplayId(product, t),
    title: t.title,
  });

  const prFor = (t: LoadedTicket): PrInfo | null =>
    t.prUrl ? (prs.get(t.prUrl) ?? null) : null;

  const stageTickets = scoped
    .map((t) => {
      const stage = stageOf(t.status);
      if (!stage) return null;
      const since =
        stage === "done" || stage === "deployed"
          ? (t.completedAt ?? t.updatedAt)
          : (statusSince.get(`${t.id}:${t.status}`) ?? t.updatedAt);
      return {
        ticket: t,
        id: t.id,
        stage,
        ageMs: Math.max(0, now.getTime() - since.getTime()),
        isAgent: t.assignee?.isAgent ?? false,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const stages = summarizeStages(stageTickets);
  const bottleneck = findBottleneck(stageTickets);
  const waitingOn = computeWaitingOn(
    stageTickets.map((s) => ({ stage: s.stage, status: s.ticket.status, isAgent: s.isAgent })),
  );
  const inFlight = stageTickets.filter((s) =>
    (["inProgress", "inReview"] as StageKey[]).includes(s.stage),
  );
  const activeHumans = new Set(
    inFlight.filter((s) => s.ticket.assignee && !s.isAgent).map((s) => s.ticket.assignee!.id),
  ).size;

  // ---- burn-up ----
  const cycleStart = cycle?.startDate ?? null;
  const cycleEnd = cycle?.endDate ?? null;
  const burnup =
    cycleStart && cycleEnd
    ? computeBurnup(
        { startDate: cycleStart, endDate: cycleEnd },
        scoped.map((t) => {
          const joined = cycleJoinedAt.get(t.id);
          const addedAt =
            joined && joined > t.createdAt ? joined : t.createdAt;
          return {
            addedAt: addedAt < cycleStart ? cycleStart : addedAt,
            doneAt:
              t.status === "DONE" || t.status === "DEPLOYED"
                ? (t.completedAt ?? t.updatedAt)
                : null,
          };
        }),
        now,
      )
    : null;

  // ---- critical path (open tickets, blocker first) ----
  const openById = new Map(openTickets.map((t) => [t.id, t]));
  const scopedOpenIds = new Set(scoped.filter((t) => openById.has(t.id)).map((t) => t.id));
  const chainIds = computeCriticalPath(
    openTickets.map((t) => ({ id: t.id, weight: t.points ?? 1 })),
    deps.map((d) => ({ blockerId: d.dependsOnId, ticketId: d.ticketId })),
  );
  const chainTouchesScope = chainIds.some((id) => scopedOpenIds.has(id));
  const criticalPath = (chainTouchesScope ? chainIds : []).map((id, i, all) => {
    const t = openById.get(id)!;
    const prev = i > 0 ? openById.get(all[i - 1]!) : undefined;
    const started = t.status === "IN_PROGRESS" || t.status === "QA";
    const kind: "active" | "blocked" | "waiting" =
      t.status === "BLOCKED" ? "blocked" : started ? "active" : "waiting";
    return {
      ...ref(t),
      kind,
      status: t.status,
      assigneeName: t.assignee?.name ?? null,
      prevDisplayId: prev ? ticketDisplayId(product, prev) : null,
    };
  });
  const scopedHaveDeps = deps.some(
    (d) => scopedOpenIds.has(d.ticketId) || scopedOpenIds.has(d.dependsOnId),
  );

  // ---- at risk (cycle only) ----
  const blockerOf = new Map<string, string>();
  for (const d of deps) {
    const b = openById.get(d.dependsOnId);
    if (b && !blockerOf.has(d.ticketId)) blockerOf.set(d.ticketId, ticketDisplayId(product, b));
  }
  // Median cycle time (first move to IN_PROGRESS -> completion), last 12 weeks.
  const cycleTimes = completedLast12Weeks
    .map((t) => {
      const start = startedAt.get(t.id);
      return start && t.completedAt ? t.completedAt.getTime() - start.getTime() : null;
    })
    .filter((ms): ms is number => ms !== null && ms > 0);
  const medianCycleMs =
    cycleTimes.length >= MIN_CYCLE_TIME_SAMPLES ? median(cycleTimes) : null;
  const msUntilDue = cycleEnd ? cycleEnd.getTime() + DAY - now.getTime() : null;
  const atRisk = cycle
    ? stageTickets
        .filter((s) => s.stage !== "done" && s.stage !== "deployed")
        .map((s) => {
          const t = s.ticket;
          const pr = prFor(t);
          let reason:
            | { kind: "blocked"; by: string | null }
            | { kind: "slipping"; due: Date }
            | { kind: "noReview"; ageMs: number }
            | { kind: "unassigned" }
            | null = null;
          if (t.status === "BLOCKED" || blockerOf.has(t.id)) {
            reason = { kind: "blocked", by: blockerOf.get(t.id) ?? null };
          } else if (
            cycleEnd &&
            msUntilDue !== null &&
            isSlipping(s.stage, s.ageMs, medianCycleMs, msUntilDue)
          ) {
            reason = { kind: "slipping", due: cycleEnd };
          } else if (s.stage === "inReview" && !pr?.reviewed && s.ageMs > DAY) {
            reason = { kind: "noReview", ageMs: s.ageMs };
          } else if (!t.assignee) {
            reason = { kind: "unassigned" };
          }
          return reason ? { ...ref(t), reason, ageMs: s.ageMs } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => {
          const rank = { blocked: 0, slipping: 1, noReview: 2, unassigned: 3 };
          return rank[a.reason.kind] - rank[b.reason.kind] || b.ageMs - a.ageMs;
        })
        .slice(0, 5)
    : [];

  // ---- team ----
  interface TeamRow {
    id: string;
    name: string;
    image: string | null;
    isAgent: boolean;
    areas: Set<string>;
    tickets: {
      ticket: ReturnType<typeof ref>;
      stage: StageKey;
      blocked: boolean;
      pr: { number: number; url: string; state: PrState } | null;
    }[];
  }
  const team = new Map<string, TeamRow>();
  for (const s of stageTickets) {
    const a = s.ticket.assignee;
    if (!a || s.stage === "done" || s.stage === "deployed") continue;
    const row: TeamRow = team.get(a.id) ?? {
      id: a.id,
      name: a.name ?? "Unnamed",
      image: a.image,
      isAgent: a.isAgent,
      areas: new Set<string>(),
      tickets: [],
    };
    const area = s.ticket.feature?.area?.name;
    if (area) row.areas.add(area);
    const pr = prFor(s.ticket);
    const parsed = s.ticket.prUrl ? parsePrUrl(s.ticket.prUrl) : null;
    row.tickets.push({
      ticket: ref(s.ticket),
      stage: s.stage,
      blocked: s.ticket.status === "BLOCKED",
      pr: s.ticket.prUrl
        ? {
            number: pr?.number ?? parsed?.number ?? 0,
            url: s.ticket.prUrl,
            state: pr?.state ?? "open",
          }
        : null,
    });
    team.set(a.id, row);
  }
  const stageRank: Record<StageKey, number> = {
    inReview: 0, inProgress: 1, committed: 2, done: 3, deployed: 4,
  };
  const teamRows = [...team.values()]
    .map((r) => ({
      ...r,
      areas: [...r.areas].sort(),
      tickets: r.tickets.sort((a, b) => stageRank[a.stage] - stageRank[b.stage]),
    }))
    .sort(
      (a, b) =>
        Number(a.isAgent) - Number(b.isAgent) || b.tickets.length - a.tickets.length,
    );

  // ---- PRs waiting ----
  const ticketByPrUrl = new Map(
    [...openTickets, ...scoped].filter((t) => t.prUrl).map((t) => [t.prUrl!, t]),
  );
  const allPrs = [...prs.values()];
  const openPrs = allPrs
    .filter((p) => p.state !== "merged" && p.state !== "closed")
    .map((p) => {
      const t = ticketByPrUrl.get(p.url);
      return {
        url: p.url,
        repo: p.repo,
        number: p.number,
        title: p.title ?? t?.title ?? p.url,
        author: p.author,
        state: p.state,
        reviewed: p.reviewed,
        waitMs: p.openedAt ? Math.max(0, now.getTime() - p.openedAt.getTime()) : 0,
        ticket: t ? ref(t) : null,
        authorIsAgent: t?.assignee?.isAgent ?? false,
      };
    })
    .sort((a, b) => b.waitMs - a.waitMs);
  const mergeTimes = allPrs
    .filter((p) => p.state === "merged" && p.openedAt && p.mergedAt)
    .map((p) => p.mergedAt!.getTime() - p.openedAt!.getTime());

  // ---- summary inputs ----
  const doneInWindow = recentCompleted.filter((t) => t.status === "DONE").length;
  const deployedInWindow = recentCompleted.filter((t) => t.status === "DEPLOYED").length;

  return {
    firstRun,
    windowDays: WINDOW_DAYS,
    cycle: cycle
      ? {
          id: cycle.id,
          name: cycle.name,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          burnup,
        }
      : null,
    weekly: weeklyCompleted(
      completedLast12Weeks.map((t) => t.completedAt!).filter(Boolean),
      now,
    ),
    summary: {
      shippedScopes: shippedScopes.map((s) => ({ feature: s.feature.name, scope: s.version })),
      doneInWindow,
      deployedInWindow,
    },
    atRisk,
    criticalPath,
    criticalPathHasDeps: scopedHaveDeps,
    stages,
    bottleneck,
    waitingOn,
    wip: { count: inFlight.length, activeHumans },
    team: teamRows,
    prs: {
      hasData: hasPrData || repoNames.length > 0,
      open: openPrs.length,
      withoutReview: openPrs.filter((p) => !p.reviewed).length,
      medianWaitMs: median(openPrs.map((p) => p.waitMs)),
      medianMergeMs: median(mergeTimes),
      rows: openPrs.slice(0, 25),
    },
  };
}

export type ManagerOverview = Awaited<ReturnType<typeof loadManagerOverview>>;
