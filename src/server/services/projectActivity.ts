import type { Prisma, PrismaClient } from "@prisma/client";

export const PROJECT_ACTIVITY_TYPES = {
  STATUS_CHANGED: "STATUS_CHANGED",
  DUE_DATE_CHANGED: "DUE_DATE_CHANGED",
  ASSIGNEE_CHANGED: "ASSIGNEE_CHANGED",
  ACTION_CREATED: "ACTION_CREATED",
  ACTION_DELETED: "ACTION_DELETED",
} as const;

export type ProjectActivityType =
  (typeof PROJECT_ACTIVITY_TYPES)[keyof typeof PROJECT_ACTIVITY_TYPES];

type DbClient = PrismaClient | Prisma.TransactionClient;

interface LogProjectActivityArgs {
  projectId: string;
  actionId?: string | null;
  type: ProjectActivityType;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Prisma.InputJsonValue;
  changedById?: string | null;
}

export async function logProjectActivity(
  db: DbClient,
  args: LogProjectActivityArgs,
): Promise<void> {
  await db.projectActivity.create({
    data: {
      projectId: args.projectId,
      actionId: args.actionId ?? null,
      type: args.type,
      fromValue: args.fromValue ?? null,
      toValue: args.toValue ?? null,
      metadata: args.metadata,
      changedById: args.changedById ?? null,
    },
  });
}

function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  const aTime = a ? new Date(a).getTime() : null;
  const bTime = b ? new Date(b).getTime() : null;
  return aTime === bTime;
}

interface ActionDiff {
  status?: { from: string | null; to: string };
  dueDate?: { from: Date | null; to: Date | null };
  assigneeIds?: { from: string[]; to: string[] };
}

interface LogActionDiffArgs {
  projectId: string;
  actionId: string;
  changedById?: string | null;
  diff: ActionDiff;
}

export async function logActionDiffActivities(
  db: DbClient,
  { projectId, actionId, changedById, diff }: LogActionDiffArgs,
): Promise<void> {
  const writes: Promise<void>[] = [];

  if (diff.status && diff.status.from !== diff.status.to) {
    writes.push(
      logProjectActivity(db, {
        projectId,
        actionId,
        changedById,
        type: PROJECT_ACTIVITY_TYPES.STATUS_CHANGED,
        fromValue: diff.status.from,
        toValue: diff.status.to,
      }),
    );
  }

  if (diff.dueDate && !sameDate(diff.dueDate.from, diff.dueDate.to)) {
    writes.push(
      logProjectActivity(db, {
        projectId,
        actionId,
        changedById,
        type: PROJECT_ACTIVITY_TYPES.DUE_DATE_CHANGED,
        fromValue: diff.dueDate.from ? new Date(diff.dueDate.from).toISOString() : null,
        toValue: diff.dueDate.to ? new Date(diff.dueDate.to).toISOString() : null,
      }),
    );
  }

  if (diff.assigneeIds) {
    const fromSet = new Set(diff.assigneeIds.from);
    const toSet = new Set(diff.assigneeIds.to);
    const added = diff.assigneeIds.to.filter((id) => !fromSet.has(id));
    const removed = diff.assigneeIds.from.filter((id) => !toSet.has(id));
    if (added.length > 0 || removed.length > 0) {
      writes.push(
        logProjectActivity(db, {
          projectId,
          actionId,
          changedById,
          type: PROJECT_ACTIVITY_TYPES.ASSIGNEE_CHANGED,
          fromValue: diff.assigneeIds.from.join(","),
          toValue: diff.assigneeIds.to.join(","),
          metadata: { added, removed },
        }),
      );
    }
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }
}
