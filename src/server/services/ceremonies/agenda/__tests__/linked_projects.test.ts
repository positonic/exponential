import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { linkedProjectsSection, linkedProjectsWhere } from "../sections/linked_projects";
import type { SectionContext } from "../types";

const now = new Date("2026-09-27T08:00:00Z");
const section = { key: "auto_linked_projects", type: "linked_projects", title: "Projects" };

function ceremony(over: Partial<Ceremony> = {}): Ceremony {
  return { id: "cer-1", workspaceId: "ws-1", productId: null, teamId: null, ...over } as Ceremony;
}

function ctx(db: PrismaClient, overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: ceremony(),
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: null,
    participantUserIds: [],
    projectIds: [],
    now,
    workspacePath: "/w/ws",
    ...overrides,
  };
}

describe("linkedProjectsWhere", () => {
  it("is null for a ceremony linked to nothing, so the section fails closed", () => {
    expect(linkedProjectsWhere(ceremony(), [])).toBeNull();
  });

  it("unions the ceremony's projects, its product's projects and its team's projects inside the workspace", () => {
    expect(linkedProjectsWhere(ceremony({ productId: "prod-1", teamId: "team-1" }), ["p-1", "p-2"])).toEqual({
      workspaceId: "ws-1",
      OR: [{ id: { in: ["p-1", "p-2"] } }, { productId: "prod-1" }, { teamId: "team-1" }],
    });
    expect(linkedProjectsWhere(ceremony({ productId: "prod-1" }), [])).toEqual({ workspaceId: "ws-1", OR: [{ productId: "prod-1" }] });
  });
});

describe("linked_projects section", () => {
  it("lists nothing and runs no query when the ceremony has no scope", async () => {
    const db = mockDeep<PrismaClient>();
    const items = await linkedProjectsSection.run(ctx(db), section);
    expect(items).toEqual([]);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("lists the ACTIVE projects in scope with DRI, next action, state, goal chip and link", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue([
      {
        id: "p-1",
        name: "Website",
        slug: "website",
        priority: "HIGH",
        progress: 40,
        reviewDate: null,
        endDate: null,
        workspace: { slug: "syntrofi" },
        dri: { id: "u-1", name: "James" },
        actions: [
          { id: "a-2", name: "Write copy", dueDate: null, scheduledStart: null, createdAt: new Date("2026-09-01T00:00:00Z") },
          { id: "a-1", name: "Ship landing page", dueDate: new Date("2026-10-02T00:00:00Z"), scheduledStart: null, createdAt: new Date("2026-09-10T00:00:00Z") },
        ],
      },
      {
        id: "p-2",
        name: "Onboarding",
        slug: "onboarding",
        priority: "NONE",
        progress: 10,
        reviewDate: null,
        endDate: null,
        workspace: { slug: "syntrofi" },
        dri: null,
        actions: [],
      },
    ] as never);
    db.goal.findMany.mockResolvedValue([{ id: 7, title: "Grow signups", projects: [{ id: "p-1" }] }] as never);

    const items = await linkedProjectsSection.run(ctx(db, { ceremony: ceremony({ productId: "prod-1" }) }), section);

    expect(db.project.findMany.mock.calls[0]![0]!.where).toEqual({
      workspaceId: "ws-1",
      OR: [{ productId: "prod-1" }],
      status: "ACTIVE",
    });
    // Neither needs attention and neither has an end date, so lowest progress first.
    expect(items.map((i) => i.id)).toEqual(["auto_linked_projects:project:p-2", "auto_linked_projects:project:p-1"]);
    expect(items[1]).toMatchObject({
      title: "Website",
      refType: "project",
      refId: "p-1",
      goalId: 7,
      goalTitle: "Grow signups",
      detail: "DRI James · next: Ship landing page (2 Oct) · 40% · 2 open",
      href: "/w/syntrofi/projects/website-p-1",
    });
    expect(items[0]).toMatchObject({
      title: "Onboarding",
      goalId: null,
      detail: "no DRI · no next action · 10% · 0 open",
    });
  });

  it("flags a project needing attention and calls out an overdue next action", async () => {
    const db = mockDeep<PrismaClient>();
    db.project.findMany.mockResolvedValue([
      {
        id: "p-1",
        name: "Grants",
        slug: "grants",
        priority: "NONE",
        progress: 0,
        reviewDate: null,
        endDate: null,
        workspace: { slug: "syntrofi" },
        dri: { id: "u-2", name: null },
        actions: [{ id: "a-1", name: "Submit form", dueDate: new Date("2026-09-20T00:00:00Z"), scheduledStart: null, createdAt: now }],
      },
    ] as never);
    db.goal.findMany.mockResolvedValue([] as never);
    const items = await linkedProjectsSection.run(ctx(db, { projectIds: ["p-1"] }), section);
    expect(items[0]).toMatchObject({
      title: "⚠️ Grants",
      detail: "DRI unnamed · next: Submit form (overdue, 20 Sept) · 0% · 1 open, 1 overdue",
    });
  });
});
