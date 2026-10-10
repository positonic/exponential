import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { projectStateSection } from "../sections/project_state";
import type { SectionContext } from "../types";

const now = new Date("2026-09-10T08:00:00Z");
const prevStart = new Date("2026-09-03T08:00:00Z");
const section = { key: "state", type: "project_state", title: "Where the projects stand" };

function ctx(db: PrismaClient, projectIds: string[]): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", productId: null } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: { id: "occ-0", scheduledStart: prevStart } as CeremonyOccurrence,
    participantUserIds: [],
    projectIds,
    now,
    workspacePath: "/w/ws",
  };
}

const project = (id: string, name: string) => ({
  id,
  name,
  slug: id,
  status: "ACTIVE",
  priority: "NONE",
  progress: 50,
  endDate: null,
  reviewDate: null,
  nextActionDate: null,
  goals: [],
});

describe("project_state section with several linked projects", () => {
  it("walks each project in turn, prefixing movement lines with the project's name and scoping shared ids by project", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null as never);
    db.project.findUnique
      .mockResolvedValueOnce(project("p-1", "Website") as never)
      .mockResolvedValueOnce(project("p-2", "Onboarding") as never);
    // Per project: completed, then overdue.
    db.action.findMany
      .mockResolvedValueOnce([{ id: "a-1", name: "Draft copy", completedAt: now }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "a-2", name: "Send invites", completedAt: now }] as never)
      .mockResolvedValueOnce([{ id: "a-3", name: "Book venue", dueDate: new Date("2026-09-05T00:00:00Z") }] as never);
    db.projectActivity.findMany.mockResolvedValue([] as never);

    const items = await projectStateSection.run(ctx(db, ["p-1", "p-2"]), section);

    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["state:text:project-p-1", "Website"],
      ["state:text:p-1:completed", "Website · 1 action completed since 3 Sept"],
      ["state:text:project-p-2", "Onboarding"],
      ["state:text:p-2:completed", "Onboarding · 1 action completed since 3 Sept"],
      ["state:action:a-3", "Onboarding · Book venue"],
    ]);
    expect(items.map((i) => i.order)).toEqual([0, 1, 2, 3, 4]);
    expect(db.action.findMany.mock.calls[0]![0]!.where).toMatchObject({ projectId: "p-1", status: "COMPLETED" });
    expect(db.action.findMany.mock.calls[2]![0]!.where).toMatchObject({ projectId: "p-2", status: "COMPLETED" });
  });

  it("keeps the unscoped ids and plain titles for a single project, so existing resolutions carry across", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findFirst.mockResolvedValue(null as never);
    db.project.findUnique.mockResolvedValueOnce(project("p-1", "Website") as never);
    db.action.findMany
      .mockResolvedValueOnce([{ id: "a-1", name: "Draft copy", completedAt: now }] as never)
      .mockResolvedValueOnce([] as never);
    db.projectActivity.findMany.mockResolvedValue([] as never);

    const items = await projectStateSection.run(ctx(db, ["p-1"]), section);
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["state:text:project-p-1", "Website"],
      ["state:text:completed", "1 action completed since 3 Sept"],
    ]);
  });
});
