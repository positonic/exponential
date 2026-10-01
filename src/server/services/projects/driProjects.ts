/**
 * The state of a set of projects at a glance — one loader shared by the
 * Daily summary digest (the "DRI projects" section), the daily-brief
 * ceremony's `dri_projects` agenda section and the `linked_projects` section
 * every ceremony can carry, so the notification and the agendas cannot
 * disagree on what a project looks like this morning.
 *
 * `Project.driId` is written by the project editor; `yourWork.driItems` is
 * its only other read path and returns just id/name/progress. This one adds
 * what a morning glance needs: open and overdue action counts, the next
 * review, the end date, who the DRI is, and the project's next action.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { toPlainText } from "~/lib/content/plainText";

export interface ProjectNextAction {
  id: string;
  name: string;
  /** The date the action is next relevant on: its due date, else its scheduled start. */
  when: Date | null;
}

export interface DriProjectState {
  id: string;
  name: string;
  slug: string;
  workspaceSlug: string | null;
  priority: string;
  /** 0–100. */
  progress: number;
  /** ACTIVE actions on the project. */
  openActions: number;
  /** Of those, past their due date at `now`. */
  overdueActions: number;
  reviewDate: Date | null;
  endDate: Date | null;
  /** True when the review date has passed or the end date is within 14 days. */
  needsAttention: boolean;
  /** The project's DRI, when one is set. */
  dri: { id: string; name: string | null } | null;
  /**
   * The ACTIVE action that comes next: the earliest dated one (due date, else
   * scheduled start), or, when nothing is dated, the oldest open action —
   * the one that has been waiting longest.
   */
  nextAction: ProjectNextAction | null;
}

const END_DATE_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

export interface LoadDriProjectsOptions {
  /** Narrow to one workspace; omitted means every workspace the person is DRI in. */
  workspaceId?: string | null;
  now: Date;
  take?: number;
}

export interface LoadProjectStatesOptions {
  now: Date;
  take?: number;
}

interface ActionRow {
  id: string;
  name: string;
  dueDate: Date | null;
  scheduledStart: Date | null;
  createdAt: Date;
}

function actionWhen(a: Pick<ActionRow, "dueDate" | "scheduledStart">): Date | null {
  return a.dueDate ?? a.scheduledStart ?? null;
}

/** See `DriProjectState.nextAction`. Exported for the section tests. */
export function pickNextAction(actions: ActionRow[]): ProjectNextAction | null {
  if (actions.length === 0) return null;
  const sorted = actions.slice().sort((a, b) => {
    const whenA = actionWhen(a);
    const whenB = actionWhen(b);
    if (whenA && whenB) return whenA.getTime() - whenB.getTime();
    if (whenA) return -1;
    if (whenB) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const next = sorted[0]!;
  // Legacy action names carry editor HTML; the brief lines this feeds are plain text.
  return { id: next.id, name: toPlainText(next.name) || next.name, when: actionWhen(next) };
}

/**
 * ACTIVE projects matching `where`, most urgent first: overdue review, then
 * nearest end date, then lowest progress. Bounded (`take`, default 10) so a
 * long list still reads as a brief. `where` is AND-ed with `status: ACTIVE`.
 */
export async function loadProjectStates(
  db: PrismaClient,
  where: Prisma.ProjectWhereInput,
  options: LoadProjectStatesOptions,
): Promise<DriProjectState[]> {
  const { now } = options;
  const rows = await db.project.findMany({
    where: { ...where, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      slug: true,
      priority: true,
      progress: true,
      reviewDate: true,
      endDate: true,
      workspace: { select: { slug: true } },
      dri: { select: { id: true, name: true } },
      actions: {
        where: { status: "ACTIVE" },
        select: { id: true, name: true, dueDate: true, scheduledStart: true, createdAt: true },
      },
    },
  });

  const states = (rows ?? []).map<DriProjectState>((p) => {
    const overdueActions = p.actions.filter((a) => a.dueDate !== null && a.dueDate < now).length;
    const reviewOverdue = p.reviewDate !== null && p.reviewDate < now;
    const endingSoon = p.endDate !== null && p.endDate.getTime() - now.getTime() < END_DATE_HORIZON_MS;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      workspaceSlug: p.workspace?.slug ?? null,
      priority: p.priority,
      progress: Math.round(p.progress),
      openActions: p.actions.length,
      overdueActions,
      reviewDate: p.reviewDate,
      endDate: p.endDate,
      needsAttention: reviewOverdue || endingSoon || overdueActions > 0,
      dri: p.dri ?? null,
      nextAction: pickNextAction(p.actions),
    };
  });

  states.sort((a, b) => {
    const urgency = (s: DriProjectState) => (s.needsAttention ? 0 : 1);
    if (urgency(a) !== urgency(b)) return urgency(a) - urgency(b);
    const endA = a.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const endB = b.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (endA !== endB) return endA - endB;
    return a.progress - b.progress;
  });

  return states.slice(0, options.take ?? 10);
}

/**
 * ACTIVE projects where `userId` is the DRI, most urgent first (see
 * `loadProjectStates`).
 */
export async function loadDriProjectStates(
  db: PrismaClient,
  userId: string,
  options: LoadDriProjectsOptions,
): Promise<DriProjectState[]> {
  const { workspaceId, ...rest } = options;
  return loadProjectStates(db, { driId: userId, ...(workspaceId ? { workspaceId } : {}) }, rest);
}

/** App-relative link to the project page, in the slug-cuid form the app's URLs use. */
export function driProjectPath(p: Pick<DriProjectState, "id" | "slug" | "workspaceSlug">): string | null {
  return p.workspaceSlug ? `/w/${p.workspaceSlug}/projects/${p.slug}-${p.id}` : null;
}

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/**
 * One line of state: "45% · 3 open, 1 overdue · review 2 Oct · ends 31 Dec".
 * Used verbatim by the digest renderers and as the agenda item's `detail`.
 */
export function describeDriProject(p: DriProjectState, now: Date): string {
  const parts: string[] = [`${p.progress}%`];
  const open = `${p.openActions} open`;
  parts.push(p.overdueActions > 0 ? `${open}, ${p.overdueActions} overdue` : open);
  if (p.reviewDate) {
    const label = p.reviewDate.toLocaleDateString("en-GB", dateFmt);
    parts.push(p.reviewDate < now ? `review overdue (${label})` : `review ${label}`);
  }
  if (p.endDate) parts.push(`ends ${p.endDate.toLocaleDateString("en-GB", dateFmt)}`);
  return parts.join(" · ");
}

/**
 * "Draft budget (2 Oct)" / "Draft budget (overdue, 20 Sept)" — the next
 * action with its date, or null when the project has no open action.
 */
export function nextActionLabel(p: Pick<DriProjectState, "nextAction">, now: Date): string | null {
  const next = p.nextAction;
  if (!next) return null;
  if (!next.when) return next.name;
  const label = next.when.toLocaleDateString("en-GB", dateFmt);
  return `${next.name} (${next.when < now ? "overdue, " : ""}${label})`;
}

/**
 * "next: Draft budget (due 2 Oct)" — or "no next action" when the project has
 * no open action, which is itself worth a glance.
 */
export function describeNextAction(p: Pick<DriProjectState, "nextAction">, now: Date): string {
  const label = nextActionLabel(p, now);
  return label ? `next: ${label}` : "no next action";
}

export interface DriProjectDates {
  /**
   * Why the project needs attention, in words — exactly the conditions behind
   * `needsAttention`, so a flag is never shown without its reason:
   * "ended 10 Sept" / "ends 5 Oct" (within 14 days), "review overdue (20 Sept)",
   * "2 overdue actions". Empty when the project is calm.
   */
  attention: string[];
  /** The dates that are not a concern yet: "review 2 Oct", "ends 31 Dec". */
  calm: string[];
}

/** Split a project's dates and overdue count into reasons for attention and calm dates. */
export function describeDriProjectDates(
  p: Pick<DriProjectState, "overdueActions" | "reviewDate" | "endDate">,
  now: Date,
): DriProjectDates {
  const attention: string[] = [];
  const calm: string[] = [];
  if (p.endDate) {
    const label = p.endDate.toLocaleDateString("en-GB", dateFmt);
    if (p.endDate < now) attention.push(`ended ${label}`);
    else if (p.endDate.getTime() - now.getTime() < END_DATE_HORIZON_MS) attention.push(`ends ${label}`);
    else calm.push(`ends ${label}`);
  }
  if (p.reviewDate) {
    const label = p.reviewDate.toLocaleDateString("en-GB", dateFmt);
    if (p.reviewDate < now) attention.push(`review overdue (${label})`);
    else calm.unshift(`review ${label}`);
  }
  if (p.overdueActions > 0) {
    attention.push(`${p.overdueActions} overdue action${p.overdueActions === 1 ? "" : "s"}`);
  }
  return { attention, calm };
}
