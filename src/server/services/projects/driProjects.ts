/**
 * The state of the projects a person is DRI for — one loader shared by the
 * Daily summary digest (the "DRI projects" section) and the daily-brief
 * ceremony's `dri_projects` agenda section, so the notification and the
 * agenda cannot disagree on what "my projects" look like this morning.
 *
 * `Project.driId` is written by the project editor; `yourWork.driItems` is
 * its only other read path and returns just id/name/progress. This one adds
 * what a morning glance needs: open and overdue action counts, the next
 * review, and the end date.
 */
import type { PrismaClient } from "@prisma/client";

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
}

const END_DATE_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

export interface LoadDriProjectsOptions {
  /** Narrow to one workspace; omitted means every workspace the person is DRI in. */
  workspaceId?: string | null;
  now: Date;
  take?: number;
}

/**
 * ACTIVE projects where `userId` is the DRI, most urgent first: overdue
 * review, then nearest end date, then lowest progress. Bounded (`take`,
 * default 10) so a prolific DRI still gets a readable brief.
 */
export async function loadDriProjectStates(
  db: PrismaClient,
  userId: string,
  options: LoadDriProjectsOptions,
): Promise<DriProjectState[]> {
  const { now, workspaceId } = options;
  const rows = await db.project.findMany({
    where: {
      driId: userId,
      status: "ACTIVE",
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      priority: true,
      progress: true,
      reviewDate: true,
      endDate: true,
      workspace: { select: { slug: true } },
      actions: { where: { status: "ACTIVE" }, select: { dueDate: true } },
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
