/**
 * `linked_projects`: the ACTIVE projects in the ceremony's scope, each as one
 * item — who the DRI is, what the next action is, and the same one-line
 * state the Daily summary prints — so a room reviewing "how's it going"
 * opens with the projects and not with a search for them.
 *
 * Scope is the union of what the ceremony is linked to: its projects
 * (`CeremonyProject`), every project in its product, every project of its
 * team. Fails closed like `project_state`: a ceremony linked to nothing lists
 * nothing, because "the whole workspace" would present other rooms' projects
 * as this one's.
 *
 * `generateAgenda` appends this section to every agenda whose ceremony has
 * `includeProjects` on and whose template does not already place it.
 */
import type { Ceremony, Prisma } from "@prisma/client";
import { describeDriProject, describeNextAction, driProjectPath, loadProjectStates, nextActionLabel } from "~/server/services/projects/driProjects";
import type { AgendaItem, SectionModule } from "../types";

const MAX_PROJECTS = 25;

/** Prisma filter for the projects in the ceremony's scope; null when it has no scope. */
export function linkedProjectsWhere(
  ceremony: Pick<Ceremony, "workspaceId" | "productId" | "teamId">,
  projectIds: string[],
): Prisma.ProjectWhereInput | null {
  const scopes: Prisma.ProjectWhereInput[] = [];
  if (projectIds.length) scopes.push({ id: { in: projectIds } });
  if (ceremony.productId) scopes.push({ productId: ceremony.productId });
  if (ceremony.teamId) scopes.push({ teamId: ceremony.teamId });
  if (scopes.length === 0) return null;
  return { workspaceId: ceremony.workspaceId, OR: scopes };
}

export const linkedProjectsSection: SectionModule = {
  type: "linked_projects",
  async run(ctx, section) {
    const where = linkedProjectsWhere(ctx.ceremony, ctx.projectIds);
    if (!where) return [];
    const now = ctx.occurrence.scheduledStart;
    const states = await loadProjectStates(ctx.db, where, { now, take: MAX_PROJECTS });
    if (states.length === 0) return [];

    const goals = await ctx.db.goal.findMany({
      where: { projects: { some: { id: { in: states.map((p) => p.id) } } } },
      select: { id: true, title: true, projects: { select: { id: true } } },
    });
    const goalByProject = new Map<string, { id: number; title: string }>();
    for (const g of goals ?? []) {
      for (const p of g.projects) if (!goalByProject.has(p.id)) goalByProject.set(p.id, { id: g.id, title: g.title });
    }

    const items: AgendaItem[] = [];
    for (const p of states) {
      const goal = goalByProject.get(p.id) ?? null;
      const named = p.dri?.name?.trim();
      const driName = p.dri ? (named ? named : "unnamed") : null;
      const dri = driName ? `DRI ${driName}` : "no DRI";
      const next = nextActionLabel(p, now);
      items.push({
        id: `${section.key}:project:${p.id}`,
        sectionKey: section.key,
        title: `${p.needsAttention ? "⚠️ " : ""}${p.name}`,
        refType: "project",
        refId: p.id,
        goalId: goal?.id ?? null,
        goalTitle: goal?.title ?? null,
        order: items.length,
        detail: [dri, describeNextAction(p, now), describeDriProject(p, now)].join(" · "),
        owner: driName ?? "no DRI",
        lines: [next ? `Next: ${next}` : "No next action", describeDriProject(p, now)],
        needsAttention: p.needsAttention,
        href: driProjectPath(p),
      });
    }
    return items;
  },
};
