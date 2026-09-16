import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { getOccurrenceSummary } from "../summary";
import type { OccurrenceUpdateScope } from "../occurrenceUpdates";

const scope = (overrides: Partial<OccurrenceUpdateScope> = {}): OccurrenceUpdateScope => ({
  occurrenceId: "occ-1",
  workspaceId: "ws-1",
  ceremonyId: "cer-1",
  kind: "STANDUP",
  projectId: null,
  scheduledStart: new Date("2026-09-12T08:00:00Z"),
  previousStart: new Date("2026-09-11T08:00:00Z"),
  participantUserIds: ["u-1", "u-2"],
  ...overrides,
});

function db() {
  const mock = mockDeep<PrismaClient>();
  mock.user.findMany.mockResolvedValue([
    { id: "u-1", name: "Andi", email: "andi@example.com", image: null },
    { id: "u-2", name: "Zineb", email: "z@example.com", image: null },
  ] as never);
  mock.ceremonyOccurrenceUpdate.findMany.mockResolvedValue([] as never);
  return mock;
}

describe("getOccurrenceSummary", () => {
  it("lists participants who haven't answered beside those who have", async () => {
    const mock = db();
    mock.ceremonyOccurrenceUpdate.findMany.mockResolvedValue([
      {
        userId: "u-1",
        answers: { done: "- Shipped it" },
        submittedAt: new Date("2026-09-12T07:00:00Z"),
        flaggedBlocker: false,
      },
    ] as never);
    const summary = await getOccurrenceSummary(mock, scope());
    expect(summary.submittedCount).toBe(1);
    expect(summary.participants.map((p) => p.name)).toEqual(["Andi", "Zineb"]);
    expect(summary.participants[1]!.submittedAt).toBeNull();
    expect(summary.participants[0]!.answers).toEqual({ done: "- Shipped it" });
  });

  it("keeps an unsubmitted draft private", async () => {
    const mock = db();
    mock.ceremonyOccurrenceUpdate.findMany.mockResolvedValue([
      { userId: "u-1", answers: { done: "- half-written" }, submittedAt: null, flaggedBlocker: true },
    ] as never);
    const summary = await getOccurrenceSummary(mock, scope());
    expect(summary.participants[0]!.answers).toEqual({});
    expect(summary.participants[0]!.flaggedBlocker).toBe(false);
    expect(summary.submittedCount).toBe(0);
    expect(summary.blockedCount).toBe(0);
  });

  it("counts blockers only from submitted updates", async () => {
    const mock = db();
    mock.ceremonyOccurrenceUpdate.findMany.mockResolvedValue([
      { userId: "u-1", answers: {}, submittedAt: new Date(), flaggedBlocker: true },
      { userId: "u-2", answers: {}, submittedAt: new Date(), flaggedBlocker: false },
    ] as never);
    const summary = await getOccurrenceSummary(mock, scope());
    expect(summary.blockedCount).toBe(1);
  });

  it("returns nothing for a kind with no async format, without querying", async () => {
    const mock = db();
    const summary = await getOccurrenceSummary(mock, scope({ kind: "PLANNING" }));
    expect(summary).toEqual({ questions: [], participants: [], submittedCount: 0, blockedCount: 0 });
    expect(mock.user.findMany).not.toHaveBeenCalled();
  });

  it("returns nothing for a ceremony with no participants", async () => {
    const mock = db();
    const summary = await getOccurrenceSummary(mock, scope({ participantUserIds: [] }));
    expect(summary.participants).toEqual([]);
    expect(mock.ceremonyOccurrenceUpdate.findMany).not.toHaveBeenCalled();
  });
});
