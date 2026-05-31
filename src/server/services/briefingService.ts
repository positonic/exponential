/**
 * Briefing data service — read-only structured "today" data for a user.
 *
 * Extracts the data-gathering half of `briefing.getMorningBriefing`
 * (src/server/api/routers/briefing.ts) into a reusable, side-effect-free
 * function so non-tRPC callers (the voice daily-brief module) can get the same
 * structured briefing WITHOUT the LLM narrative, calendar/meeting I/O, or any
 * DB writes. The query semantics here intentionally mirror that procedure:
 *
 *   - due today  : status ACTIVE, dueDate within [startOfDay, endOfDay], for
 *                  actions the user created (and isn't assigned away) or is
 *                  assigned to.
 *   - overdue    : same ownership, status ACTIVE, dueDate < startOfDay.
 *   - projects needing attention : user's ACTIVE projects with progress < 50%.
 *
 * Keep this in sync with briefing.ts if those clauses change.
 */
import type { PrismaClient } from "@prisma/client";
import { startOfDay, endOfDay } from "date-fns";

export interface BriefingActionLite {
  id: string;
  name: string;
  dueDate: Date | null;
  priority: string;
  projectName: string | null;
}

export interface BriefingProjectLite {
  id: string;
  name: string;
  progress: number;
  actionCount: number;
}

export interface BriefingData {
  dueTodayActions: BriefingActionLite[];
  overdueActions: BriefingActionLite[];
  projectsNeedingAttention: BriefingProjectLite[];
}

export interface GenerateBriefingOptions {
  workspaceId?: string;
  /** Injectable "now" for deterministic tests. */
  now?: Date;
}

/** Ownership clause matching briefing.getMorningBriefing: created-by-me (and not
 *  assigned away) OR assigned-to-me. */
function ownershipWhere(userId: string) {
  return {
    OR: [
      { createdById: userId, assignees: { none: {} } },
      { assignees: { some: { userId } } },
    ],
  };
}

/**
 * Gather structured briefing data for a user. Read-only: only findMany calls,
 * never writes (the DailyBriefing cache table is untouched).
 */
export async function generateBriefingData(
  userId: string,
  db: PrismaClient,
  options?: GenerateBriefingOptions,
): Promise<BriefingData> {
  const now = options?.now ?? new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const workspaceId = options?.workspaceId;
  const own = ownershipWhere(userId);

  const [dueTodayRaw, overdueRaw, projectsRaw] = await Promise.all([
    db.action.findMany({
      where: {
        ...own,
        status: "ACTIVE",
        dueDate: { gte: todayStart, lte: todayEnd },
        ...(workspaceId ? { project: { workspaceId } } : {}),
      },
      include: { project: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    db.action.findMany({
      where: {
        ...own,
        status: "ACTIVE",
        dueDate: { lt: todayStart },
        ...(workspaceId ? { project: { workspaceId } } : {}),
      },
      include: { project: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    db.project.findMany({
      where: {
        createdById: userId,
        status: "ACTIVE",
        progress: { lt: 50 },
        ...(workspaceId ? { workspaceId } : {}),
      },
      include: {
        _count: { select: { actions: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { progress: "asc" },
      take: 10,
    }),
  ]);

  const mapAction = (a: {
    id: string;
    name: string;
    dueDate: Date | null;
    priority: string | null;
    project: { name: string } | null;
  }): BriefingActionLite => ({
    id: a.id,
    name: a.name,
    dueDate: a.dueDate,
    priority: a.priority ?? "NONE",
    projectName: a.project?.name ?? null,
  });

  return {
    dueTodayActions: dueTodayRaw.map(mapAction),
    overdueActions: overdueRaw.map(mapAction),
    projectsNeedingAttention: projectsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      progress: p.progress,
      actionCount: p._count.actions,
    })),
  };
}
