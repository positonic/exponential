/**
 * `dri_projects`: the ACTIVE projects in the workspace each participant is
 * DRI for, most urgent first, with the same one-line state the Daily summary
 * prints (`describeDriProject`). Rolls up to the project's first objective
 * for the goal chip.
 */
import { describeDriProject, driProjectPath, loadDriProjectStates } from "~/server/services/projects/driProjects";
import type { AgendaItem, SectionModule } from "../types";
import { briefPeople, personPrefix } from "./dailyBrief";

export const driProjectsSection: SectionModule = {
  type: "dri_projects",
  async run(ctx, section) {
    const now = ctx.occurrence.scheduledStart;
    const people = await briefPeople(ctx);
    const items: AgendaItem[] = [];

    for (const person of people) {
      const prefix = personPrefix(people, person);
      const states = await loadDriProjectStates(ctx.db, person.id, { workspaceId: ctx.workspaceId, now });
      if (states.length === 0) continue;
      const goals = await ctx.db.goal.findMany({
        where: { projects: { some: { id: { in: states.map((p) => p.id) } } } },
        select: { id: true, title: true, projects: { select: { id: true } } },
      });
      const goalByProject = new Map<string, { id: number; title: string }>();
      for (const g of goals ?? []) {
        for (const p of g.projects) if (!goalByProject.has(p.id)) goalByProject.set(p.id, { id: g.id, title: g.title });
      }
      for (const p of states) {
        const goal = goalByProject.get(p.id) ?? null;
        items.push({
          id: `${section.key}:project:${p.id}`,
          sectionKey: section.key,
          title: `${prefix}${p.needsAttention ? "⚠️ " : ""}${p.name}`,
          refType: "project",
          refId: p.id,
          goalId: goal?.id ?? null,
          goalTitle: goal?.title ?? null,
          order: items.length,
          detail: describeDriProject(p, now),
          href: driProjectPath(p),
        });
      }
    }
    return items;
  },
};
