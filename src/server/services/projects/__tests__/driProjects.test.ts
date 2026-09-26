import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { describeDriProject, driProjectPath, loadDriProjectStates } from "../driProjects";

const now = new Date("2026-09-26T08:00:00.000Z");

const row = (over: Record<string, unknown>) => ({
  id: "p", name: "P", slug: "p", priority: "NONE", progress: 0,
  reviewDate: null, endDate: null, workspace: { slug: "acme" }, actions: [], ...over,
});

describe("loadDriProjectStates", () => {
  it("queries the user's ACTIVE DRI projects, optionally in one workspace, and counts open and overdue actions", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue([
      row({ id: "p-1", name: "Calm", progress: 80 }),
      row({
        id: "p-2", name: "Hot", progress: 20.6,
        actions: [{ dueDate: new Date("2026-09-20T00:00:00.000Z") }, { dueDate: new Date("2026-10-20T00:00:00.000Z") }, { dueDate: null }],
      }),
      row({ id: "p-3", name: "Ending", progress: 50, endDate: new Date("2026-10-01T00:00:00.000Z") }),
    ] as never);

    const states = await loadDriProjectStates(db, "u-1", { now, workspaceId: "ws-1" });

    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({ driId: "u-1", status: "ACTIVE", workspaceId: "ws-1" });
    // Needs-attention first (nearest end date before none), the calm one last.
    expect(states.map((s) => s.name)).toEqual(["Ending", "Hot", "Calm"]);
    expect(states[1]).toMatchObject({ progress: 21, openActions: 3, overdueActions: 1, needsAttention: true });
    expect(states[2]).toMatchObject({ needsAttention: false });
  });

  it("omits the workspace filter for a cross-workspace read and bounds the list", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, i) => row({ id: `p-${i}`, name: `P${i}`, progress: i })) as never);
    const states = await loadDriProjectStates(db, "u-1", { now });
    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({ driId: "u-1", status: "ACTIVE" });
    expect(states).toHaveLength(10);
  });
});

describe("describeDriProject / driProjectPath", () => {
  it("renders the one-line state and the slug-cuid project path", () => {
    const state = {
      id: "p-1", name: "GTM", slug: "gtm", workspaceSlug: "acme", priority: "HIGH", progress: 40,
      openActions: 5, overdueActions: 2, reviewDate: new Date("2026-09-20T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"), needsAttention: true,
    };
    expect(describeDriProject(state, now)).toBe("40% · 5 open, 2 overdue · review overdue (20 Sept) · ends 31 Dec");
    expect(describeDriProject({ ...state, overdueActions: 0, reviewDate: new Date("2026-10-02T00:00:00.000Z"), endDate: null }, now)).toBe("40% · 5 open · review 2 Oct");
    expect(driProjectPath(state)).toBe("/w/acme/projects/gtm-p-1");
    expect(driProjectPath({ ...state, workspaceSlug: null })).toBeNull();
  });
});
