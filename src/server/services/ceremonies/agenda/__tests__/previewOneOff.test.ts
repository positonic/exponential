import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { SectionContext } from "../types";

const { runs } = vi.hoisted(() => ({ runs: [] as Array<{ type: string; ctx: SectionContext }> }));
const ITEMS: Record<string, string[]> = {
  project_state: ["Status: active", "Shipped onboarding", "Launch on 20 Oct", "Two tickets moved"],
  blockers: [],
  linked_projects: [],
};
vi.mock("../sections", () => ({
  getSectionModule: (type: string) => ({
    type,
    run: (ctx: SectionContext, section: { key: string; config?: { items?: string[] } }) => {
      runs.push({ type, ctx });
      const titles = type === "free_text" ? (section.config?.items ?? []) : (ITEMS[type] ?? []);
      return Promise.resolve(
        titles.map((title, order) => ({ id: `${section.key}:${order}`, sectionKey: section.key, title, refType: "text", refId: "x", order })),
      );
    },
  }),
}));

import { previewOneOffAgenda } from "../previewOneOff";

describe("previewOneOffAgenda", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    runs.length = 0;
  });

  const preview = (extra: Partial<Parameters<typeof previewOneOffAgenda>[1]> = {}) =>
    previewOneOffAgenda(db, {
      workspaceId: "ws-1",
      workspaceSlug: "acme",
      projectId: "p-1",
      callerUserId: "u-1",
      scheduledStart: new Date("2026-10-20T09:00:00Z"),
      sectionTypes: ["project_state", "blockers", "free_text"],
      ...extra,
    });

  it("returns one row per ticked section with a count and the first three titles", async () => {
    const rows = await preview({ purpose: "Agree the scope" });
    expect(rows).toEqual([
      { key: "project_state", type: "project_state", title: "Project state", count: 4, sample: ["Status: active", "Shipped onboarding", "Launch on 20 Oct"] },
      { key: "blockers", type: "blockers", title: "Blockers", count: 0, sample: [] },
      { key: "free_text", type: "free_text", title: "Discussion", count: 1, sample: ["Agree the scope"] },
    ]);
  });

  it("drops the appended projects section when it found nothing, as generation does", async () => {
    const rows = await preview();
    expect(runs.map((r) => r.type)).toContain("linked_projects");
    expect(rows.map((r) => r.type)).not.toContain("linked_projects");
  });

  it("an empty purpose previews no free-text item", async () => {
    const rows = await preview({ purpose: "  " });
    expect(rows.find((r) => r.type === "free_text")).toMatchObject({ count: 0 });
  });

  it("titles sections from the preset", async () => {
    const rows = await preview({ presetKey: "decide", sectionTypes: ["decisions_pending", "free_text"] });
    expect(rows.map((r) => r.title)).toEqual(["Decisions for the room", "The decision"]);
  });

  it("runs the modules as a first occurrence of the project, for the caller, and never writes", async () => {
    await preview();
    const ctx = runs[0]!.ctx;
    expect(ctx.previousOccurrence).toBeNull();
    expect(ctx.projectIds).toEqual(["p-1"]);
    expect(ctx.participantUserIds).toEqual(["u-1"]);
    expect(ctx.occurrence.scheduledStart).toEqual(new Date("2026-10-20T09:00:00Z"));
    expect(ctx.workspacePath).toBe("/w/acme");
    expect(db.ceremony.create).not.toHaveBeenCalled();
    expect(db.ceremonyOccurrence.create).not.toHaveBeenCalled();
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});
