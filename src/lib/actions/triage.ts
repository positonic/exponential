import { overdueAnchor, type PartitionableAction } from "~/lib/actions/partition";

/**
 * Minimum members before a shared anchor instant counts as a bulk write rather
 * than coincidence. Two actions can plausibly land on the same instant (a
 * two-item paste); three is already implausible by hand.
 */
export const COHORT_MIN_SIZE = 3;

export interface TriageableAction extends PartitionableAction {
  name: string;
  project?: { name: string | null } | null;
}

export interface OverdueCohort<T> {
  /** The exact instant every member is stamped with. */
  stampedAt: Date;
  daysOverdue: number;
  count: number;
  /** Distinct project names represented, for explaining the cohort to a human. */
  projectNames: string[];
  actionIds: string[];
  actions: T[];
}

export interface OverdueTriage<T> {
  totalOverdue: number;
  /** How many of `totalOverdue` sit inside a cohort. */
  cohortCount: number;
  cohorts: OverdueCohort<T>[];
  /** Individually-dated overdue actions — real debt, worth reading one by one. */
  loose: T[];
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Whole days between an action's overdue anchor and today. 0 when it has no
 * anchor (which `partitionActions` never produces for the overdue bucket).
 */
export function daysOverdue(
  a: Pick<PartitionableAction, "scheduledStart" | "dueDate">,
  today: Date,
): number {
  const anchor = overdueAnchor(a);
  if (!anchor) return 0;
  return Math.round(
    (startOfDay(today).getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000),
  );
}

/**
 * Split an overdue pile into bulk-written **cohorts** and individually-dated
 * **loose** debt.
 *
 * A large overdue count is usually not a large number of missed commitments.
 * It is a handful of bulk writes — a generated project plan, a template, an
 * import — each stamping every row it created with one identical timestamp.
 * Those actions were never individually due, so rescheduling them forward just
 * re-inflicts the pile tomorrow; the honest disposition is to un-date them
 * (`action.bulkDefer`).
 *
 * Exact-instant equality is the fingerprint. Hand-entered dates carry the
 * millisecond the user hit save and effectively never collide, so a shared
 * instant across {@link COHORT_MIN_SIZE}+ actions means one writer wrote them
 * all at once.
 *
 * Pure: callers pass `today` so results are deterministic and testable.
 */
export function groupOverdueCohorts<T extends TriageableAction>(
  overdue: T[],
  options: { today: Date },
): OverdueTriage<T> {
  const { today } = options;

  const byAnchor = new Map<number, T[]>();
  const undated: T[] = [];
  for (const a of overdue) {
    const raw = a.scheduledStart ?? a.dueDate;
    if (!raw) {
      undated.push(a);
      continue;
    }
    const key = new Date(raw).getTime();
    const bucket = byAnchor.get(key);
    if (bucket) bucket.push(a);
    else byAnchor.set(key, [a]);
  }

  const cohorts: OverdueCohort<T>[] = [];
  const loose: T[] = [...undated];

  for (const [key, members] of byAnchor) {
    if (members.length < COHORT_MIN_SIZE) {
      loose.push(...members);
      continue;
    }
    const projectNames = [
      ...new Set(
        members
          .map((m) => m.project?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    cohorts.push({
      stampedAt: new Date(key),
      daysOverdue: daysOverdue(members[0]!, today),
      count: members.length,
      projectNames,
      actionIds: members.map((m) => m.id),
      actions: members,
    });
  }

  // Biggest cohort first — that is the one worth offering amnesty on.
  cohorts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.stampedAt.getTime() - b.stampedAt.getTime();
  });
  // Oldest real debt first.
  loose.sort((a, b) => {
    const diff = daysOverdue(b, today) - daysOverdue(a, today);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  return {
    totalOverdue: overdue.length,
    cohortCount: cohorts.reduce((n, c) => n + c.count, 0),
    cohorts,
    loose,
  };
}
