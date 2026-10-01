import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { describeDriProject, describeDriProjectDates, describeNextAction, driProjectPath, loadDriProjectStates, nextActionLabel, pickNextAction } from "../driProjects";

const now = new Date("2026-09-26T08:00:00.000Z");

const row = (over: Record<string, unknown>) => ({
  id: "p", name: "P", slug: "p", priority: "NONE", progress: 0,
  reviewDate: null, endDate: null, workspace: { slug: "acme" }, dri: null, actions: [], ...over,
});

const action = (over: Record<string, unknown>) => ({
  id: "a", name: "A", dueDate: null, scheduledStart: null, createdAt: new Date("2026-09-01T00:00:00.000Z"), ...over,
});

describe("loadDriProjectStates", () => {
  it("queries the user's ACTIVE DRI projects, optionally in one workspace, and counts open and overdue actions", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue([
      row({ id: "p-1", name: "Calm", progress: 80 }),
      row({
        id: "p-2", name: "Hot", progress: 20.6,
        dri: { id: "u-1", name: "James" },
        actions: [
          action({ id: "a-1", name: "Overdue", dueDate: new Date("2026-09-20T00:00:00.000Z") }),
          action({ id: "a-2", name: "Later", dueDate: new Date("2026-10-20T00:00:00.000Z") }),
          action({ id: "a-3", name: "Undated" }),
        ],
      }),
      row({ id: "p-3", name: "Ending", progress: 50, endDate: new Date("2026-10-01T00:00:00.000Z") }),
    ] as never);

    const states = await loadDriProjectStates(db, "u-1", { now, workspaceId: "ws-1" });

    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({ driId: "u-1", status: "ACTIVE", workspaceId: "ws-1" });
    // Needs-attention first (nearest end date before none), the calm one last.
    expect(states.map((s) => s.name)).toEqual(["Ending", "Hot", "Calm"]);
    expect(states[1]).toMatchObject({
      progress: 21, openActions: 3, overdueActions: 1, needsAttention: true,
      dri: { id: "u-1", name: "James" },
      nextAction: { id: "a-1", name: "Overdue", when: new Date("2026-09-20T00:00:00.000Z") },
    });
    expect(states[2]).toMatchObject({ needsAttention: false, dri: null, nextAction: null });
  });

  it("omits the workspace filter for a cross-workspace read and bounds the list", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => row({ id: `p-${i}`, name: `P${i}`, progress: i })) as never);
    const states = await loadDriProjectStates(db, "u-1", { now });
    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({ driId: "u-1", status: "ACTIVE" });
    expect(states).toHaveLength(10);
  });
});

describe("pickNextAction / describeNextAction", () => {
  it("takes the earliest dated action (due date, else scheduled start), then the oldest undated one", () => {
    const scheduled = action({ id: "s", name: "Scheduled", scheduledStart: new Date("2026-09-28T09:00:00.000Z") });
    const due = action({ id: "d", name: "Due", dueDate: new Date("2026-09-29T00:00:00.000Z") });
    const old = action({ id: "o", name: "Old", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const young = action({ id: "y", name: "Young", createdAt: new Date("2026-09-01T00:00:00.000Z") });
    expect(pickNextAction([young, due, scheduled, old])).toEqual({ id: "s", name: "Scheduled", when: scheduled.scheduledStart });
    expect(pickNextAction([young, old])).toEqual({ id: "o", name: "Old", when: null });
  });

  it("reduces a legacy HTML action name to its text so the brief line never prints markup", () => {
    const html = action({ id: "h", name: 'The agent fills in my <a target="_blank" href="https://x.test/p">time sheet</a>' });
    expect(pickNextAction([html])).toMatchObject({ id: "h", name: "The agent fills in my time sheet" });
    expect(pickNextAction([])).toBeNull();
  });

  it("describes the next action with its date, flags an overdue one, and says when there is none", () => {
    expect(describeNextAction({ nextAction: { id: "a", name: "Ship it", when: new Date("2026-10-02T00:00:00.000Z") } }, now)).toBe("next: Ship it (2 Oct)");
    expect(describeNextAction({ nextAction: { id: "a", name: "Ship it", when: new Date("2026-09-20T00:00:00.000Z") } }, now)).toBe("next: Ship it (overdue, 20 Sept)");
    expect(describeNextAction({ nextAction: { id: "a", name: "Ship it", when: null } }, now)).toBe("next: Ship it");
    expect(describeNextAction({ nextAction: null }, now)).toBe("no next action");
    expect(nextActionLabel({ nextAction: { id: "a", name: "Ship it", when: new Date("2026-10-02T00:00:00.000Z") } }, now)).toBe("Ship it (2 Oct)");
    expect(nextActionLabel({ nextAction: null }, now)).toBeNull();
  });
});

describe("describeDriProjectDates", () => {
  const calm = { overdueActions: 0, reviewDate: null, endDate: null };

  it("names every reason behind needsAttention", () => {
    expect(describeDriProjectDates({ ...calm, endDate: new Date("2026-09-10T00:00:00.000Z") }, now).attention).toEqual(["ended 10 Sept"]);
    expect(describeDriProjectDates({ ...calm, endDate: new Date("2026-10-05T00:00:00.000Z") }, now).attention).toEqual(["ends 5 Oct"]);
    expect(describeDriProjectDates({ ...calm, reviewDate: new Date("2026-09-20T00:00:00.000Z") }, now).attention).toEqual(["review overdue (20 Sept)"]);
    expect(describeDriProjectDates({ ...calm, overdueActions: 1 }, now).attention).toEqual(["1 overdue action"]);
    expect(describeDriProjectDates({ ...calm, overdueActions: 2 }, now).attention).toEqual(["2 overdue actions"]);
  });

  it("keeps dates that are not a concern yet out of the reasons", () => {
    expect(
      describeDriProjectDates({ ...calm, reviewDate: new Date("2026-10-02T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z") }, now),
    ).toEqual({ attention: [], calm: ["review 2 Oct", "ends 31 Dec"] });
    expect(describeDriProjectDates(calm, now)).toEqual({ attention: [], calm: [] });
  });

  it("flags exactly the projects the loader marks needsAttention", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue([
      row({ id: "p-1", name: "Calm", endDate: new Date("2026-12-31T00:00:00.000Z") }),
      row({ id: "p-2", name: "Ended", endDate: new Date("2026-09-10T00:00:00.000Z") }),
      row({ id: "p-3", name: "Late", actions: [action({ dueDate: new Date("2026-09-20T00:00:00.000Z") })] }),
    ] as never);
    const states = await loadDriProjectStates(db, "u-1", { now });
    for (const s of states) {
      expect(describeDriProjectDates(s, now).attention.length > 0).toBe(s.needsAttention);
    }
  });
});

describe("describeDriProject / driProjectPath", () => {
  it("renders the one-line state and the slug-cuid project path", () => {
    const state = {
      id: "p-1", name: "GTM", slug: "gtm", workspaceSlug: "acme", priority: "HIGH", progress: 40,
      openActions: 5, overdueActions: 2, reviewDate: new Date("2026-09-20T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"), needsAttention: true, dri: null, nextAction: null,
    };
    expect(describeDriProject(state, now)).toBe("40% · 5 open, 2 overdue · review overdue (20 Sept) · ends 31 Dec");
    expect(describeDriProject({ ...state, overdueActions: 0, reviewDate: new Date("2026-10-02T00:00:00.000Z"), endDate: null }, now)).toBe("40% · 5 open · review 2 Oct");
    expect(driProjectPath(state)).toBe("/w/acme/projects/gtm-p-1");
    expect(driProjectPath({ ...state, workspaceSlug: null })).toBeNull();
  });
});
