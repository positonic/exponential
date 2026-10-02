import { describe, expect, it } from "vitest";
import { projectCardLines } from "../sections/projectCard";
import type { DriProjectState } from "~/server/services/projects/driProjects";

const now = new Date("2026-10-02T13:30:00.000Z");
const state = (over: Partial<DriProjectState>): DriProjectState => ({
  id: "p1", name: "Launch", slug: "launch", workspaceSlug: "acme", priority: "NONE", progress: 0,
  openActions: 3, overdueActions: 2, reviewDate: null, endDate: null, needsAttention: true, dri: null,
  nextAction: { id: "a1", name: "Write the post", when: new Date("2026-09-26T00:00:00.000Z") },
  ...over,
});

describe("projectCardLines", () => {
  it("links the next action and flags dates that have passed, with no progress percentage", () => {
    const [next, facts] = projectCardLines(
      state({ endDate: new Date("2026-09-29T00:00:00.000Z"), reviewDate: new Date("2026-10-10T00:00:00.000Z") }),
      now,
    );
    expect(next).toEqual([{ text: "Next: " }, { text: "Write the post", href: "/w/acme/actions/a1" }, { text: " (overdue, 26 Sept)" }]);
    expect(facts).toEqual([
      { text: "3 open, 2 overdue" },
      { text: " · " },
      { text: "review 10 Oct", warn: false },
      { text: " · " },
      { text: "ended 29 Sept", warn: true },
    ]);
    expect(JSON.stringify(facts)).not.toContain("%");
  });

  it("says so when there is no next action, and leaves a future end date unflagged", () => {
    const [next, facts] = projectCardLines(
      state({ nextAction: null, overdueActions: 0, openActions: 0, endDate: new Date("2026-12-30T00:00:00.000Z"), reviewDate: new Date("2026-09-20T00:00:00.000Z") }),
      now,
    );
    expect(next).toEqual([{ text: "No next action" }]);
    expect(facts).toEqual([{ text: "0 open" }, { text: " · " }, { text: "review overdue (20 Sept)", warn: true }, { text: " · " }, { text: "ends 30 Dec", warn: false }]);
  });

  it("leaves the action unlinked when the project has no workspace slug, and an undated action without a date", () => {
    const [next] = projectCardLines(state({ workspaceSlug: null, nextAction: { id: "a2", name: "Schedule kickoff", when: null } }), now);
    expect(next).toEqual([{ text: "Next: " }, { text: "Schedule kickoff", href: null }]);
  });
});
