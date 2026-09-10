import { describe, expect, it } from "vitest";
import type { Ceremony, CeremonyOccurrence, PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { okrReviewSection } from "../sections/okr_review";
import type { SectionContext } from "../types";

const now = new Date("2026-09-10T08:00:00Z");
function ctx(db: PrismaClient, ceremony: Partial<Ceremony> = {}, previous: Partial<CeremonyOccurrence> | null = null): SectionContext {
  return {
    db,
    workspaceId: "ws-1",
    ceremony: { id: "cer-1", workspaceId: "ws-1", projectId: null, productId: null, ...ceremony } as Ceremony,
    occurrence: { id: "occ-1", scheduledStart: now } as CeremonyOccurrence,
    previousOccurrence: previous ? ({ id: "occ-0", scheduledStart: new Date("2026-09-03T08:00:00Z"), ...previous } as CeremonyOccurrence) : null,
    participantUserIds: [],
    now,
    workspacePath: "/w/ws",
  };
}
const section = { key: "okr", type: "okr_review", title: "OKRs" };

describe("okr_review section", () => {
  it("scopes to active workspace objectives (project when the ceremony has one) and flags stale or status-changed key results", async () => {
    const db = mockDeep<PrismaClient>();
    db.keyResult.findMany.mockResolvedValue([
      { id: "kr-fresh", title: "Fresh", status: "on-track", statusOverride: null, statusOverrideAt: null, currentValue: 5, targetValue: 10, unit: "count", goalId: 1, goal: { id: 1, title: "Grow" }, checkIns: [{ createdAt: new Date("2026-09-08T00:00:00Z") }] },
      { id: "kr-stale", title: "Stale", status: "on-track", statusOverride: null, statusOverrideAt: null, currentValue: 1, targetValue: 4, unit: "count", goalId: 1, goal: { id: 1, title: "Grow" }, checkIns: [{ createdAt: new Date("2026-08-20T00:00:00Z") }] },
      { id: "kr-never", title: "Never", status: "on-track", statusOverride: null, statusOverrideAt: null, currentValue: 0, targetValue: 1, unit: "count", goalId: 2, goal: { id: 2, title: "Ship" }, checkIns: [] },
      { id: "kr-flipped", title: "Flipped", status: "on-track", statusOverride: "at-risk", statusOverrideAt: new Date("2026-09-05T00:00:00Z"), currentValue: 2, targetValue: 3, unit: "count", goalId: 2, goal: { id: 2, title: "Ship" }, checkIns: [{ createdAt: new Date("2026-09-09T00:00:00Z") }] },
    ] as never);

    const items = await okrReviewSection.run(ctx(db, { projectId: "p-1" }, {}), section);

    const where = db.keyResult.findMany.mock.calls[0]![0]!.where!;
    expect(where.goal).toEqual({ workspaceId: "ws-1", status: "active", projects: { some: { id: "p-1" } } });
    expect(items.map((i) => i.refId)).toEqual(["kr-stale", "kr-never", "kr-flipped"]);
    expect(items[0]!.detail).toContain("no check-in for 21 days");
    expect(items[1]!.detail).toContain("never checked in");
    expect(items[2]!.detail).toContain("status set to at-risk");
    expect(items[0]).toMatchObject({ id: "okr:key_result:kr-stale", sectionKey: "okr", refType: "key_result", goalId: 1, keyResultId: "kr-stale", goalTitle: "Grow", keyResultTitle: "Stale", href: "/w/ws/goals?tab=okrs" });
  });

  it("honours config.days and ignores status changes without a previous occurrence", async () => {
    const db = mockDeep<PrismaClient>();
    db.keyResult.findMany.mockResolvedValue([
      { id: "kr-a", title: "A", status: "on-track", statusOverride: "off-track", statusOverrideAt: new Date("2026-09-09T00:00:00Z"), currentValue: 0, targetValue: 1, unit: "count", goalId: 1, goal: { id: 1, title: "G" }, checkIns: [{ createdAt: new Date("2026-09-01T00:00:00Z") }] },
    ] as never);
    const items = await okrReviewSection.run(ctx(db), { ...section, config: { days: 30 } });
    expect(items).toEqual([]);
  });

  it("filters for staleness in the query, so the cap bounds the answer and overflow is announced", async () => {
    const db = mockDeep<PrismaClient>();
    // 51 rows come back: the section asks for MAX_ITEMS + 1 to detect overflow.
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `kr-${i}`,
      title: `KR ${String(i).padStart(3, "0")}`,
      status: "on-track",
      statusOverride: null,
      statusOverrideAt: null,
      currentValue: 0,
      targetValue: 1,
      unit: "count",
      goalId: 1,
      goal: { id: 1, title: "Grow" },
      checkIns: [],
    }));
    db.keyResult.findMany.mockResolvedValue(rows as never);

    const items = await okrReviewSection.run(ctx(db), section);

    const where = db.keyResult.findMany.mock.calls[0]![0]!.where! as { OR?: unknown[] };
    // The predicate is in the query — a `take` applied before filtering used
    // to hide every at-risk KR whose title sorted late.
    expect(Array.isArray(where.OR)).toBe(true);
    expect(items).toHaveLength(51);
    expect(items[50]!.refType).toBe("text");
    expect(items[50]!.title).toContain("showing 50");
  });
});
