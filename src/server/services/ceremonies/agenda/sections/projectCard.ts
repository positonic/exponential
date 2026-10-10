/**
 * The two lines a project card shows in the Matrix post (`linked_projects`,
 * `dri_projects`): the next action, linked to its page, and the counts and
 * dates — no progress percentage, which reads 0% on most projects and says
 * nothing a room acts on. A date that has passed is flagged.
 */
import type { DriProjectState } from "~/server/services/projects/driProjects";
import type { AgendaItemLine, AgendaLineSpan } from "../types";

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const fmt = (d: Date) => d.toLocaleDateString("en-GB", dateFmt);

export function projectCardLines(p: DriProjectState, now: Date): AgendaItemLine[] {
  const next = p.nextAction;
  const nextLine: AgendaItemLine = next
    ? [
        { text: "Next: " },
        { text: next.name, href: p.workspaceSlug ? `/w/${p.workspaceSlug}/actions/${next.id}` : null },
        ...(next.when ? [{ text: ` (${next.when < now ? "overdue, " : ""}${fmt(next.when)})` }] : []),
      ]
    : [{ text: "No next action" }];

  const facts: AgendaLineSpan[] = [{ text: p.overdueActions > 0 ? `${p.openActions} open, ${p.overdueActions} overdue` : `${p.openActions} open` }];
  if (p.reviewDate) {
    const passed = p.reviewDate < now;
    facts.push({ text: passed ? `review overdue (${fmt(p.reviewDate)})` : `review ${fmt(p.reviewDate)}`, warn: passed });
  }
  if (p.endDate) {
    const passed = p.endDate < now;
    facts.push({ text: `${passed ? "ended" : "ends"} ${fmt(p.endDate)}`, warn: passed });
  }
  const factsLine = facts.flatMap((span, i) => (i === 0 ? [span] : [{ text: " · " }, span]));

  return [nextLine, factsLine];
}
