import { describe, it, expect } from "vitest";
import { computeDayReport, type DayReportEntryInput } from "../dayReport";

const dayStart = new Date("2026-09-11T00:00:00Z");
const dayEnd = new Date("2026-09-12T00:00:00Z");
const t = (h: number, m: number) => new Date(Date.UTC(2026, 8, 11, h, m));

const ticketX = { id: "t1", number: 7, shortId: "windy.moose", title: "V1", productId: "prod-exp" };
const projectClear = { id: "p1", name: "Ontology", productId: "prod-clear" };

function entry(
  id: string,
  start: Date,
  end: Date | null,
  action: Partial<DayReportEntryInput["action"]> & { id: string },
  extra: Partial<DayReportEntryInput> = {},
): DayReportEntryInput {
  return {
    id,
    actionId: action.id,
    workspaceId: "ws",
    startedAt: start,
    endedAt: end,
    source: "claude-desktop",
    status: "PROPOSED",
    sourceRef: null,
    note: null,
    createdByAgentId: "agent",
    action: {
      id: action.id,
      name: action.name ?? action.id,
      projectId: action.project?.id ?? null,
      ticketId: action.ticket?.id ?? null,
      project: action.project ?? null,
      ticket: action.ticket ?? null,
    },
    ...extra,
  };
}

const products = [
  { id: "prod-exp", name: "Exponential" },
  { id: "prod-clear", name: "CLEAR" },
];

describe("computeDayReport", () => {
  it("attention counts each covered minute once; session is the plain sum", () => {
    const report = computeDayReport(
      [
        entry("a", t(9, 0), t(10, 0), { id: "A", ticket: ticketX }), // 60
        entry("b", t(9, 30), t(10, 30), { id: "B", project: projectClear }), // 60, overlaps 30
      ],
      products,
      dayStart,
      dayEnd,
    );
    expect(report.attentionMinutes).toBe(90);
    expect(report.sessionMinutes).toBe(120);
    expect(report.agentRunMinutes).toBe(0);
  });

  it("roll-ups split overlapping minutes evenly and sum to attention", () => {
    const report = computeDayReport(
      [
        entry("a", t(9, 0), t(10, 0), { id: "A", ticket: ticketX }),
        entry("b", t(9, 30), t(10, 30), { id: "B", project: projectClear }),
      ],
      products,
      dayStart,
      dayEnd,
    );
    // A: 30 alone + 30 shared/2 = 45; B: 30 shared/2 + 30 alone = 45.
    expect(report.byProduct).toEqual([
      { productId: "prod-exp", name: "Exponential", minutes: 45 },
      { productId: "prod-clear", name: "CLEAR", minutes: 45 },
    ]);
    expect(report.byProduct.reduce((s, r) => s + r.minutes, 0)).toBe(report.attentionMinutes);
    expect(report.byAction.map((r) => [r.actionId, r.minutes, r.sessionMinutes])).toEqual([
      ["A", 45, 60],
      ["B", 45, 60],
    ]);
  });

  it("product resolves through the Ticket first, then the Project; neither is Unassigned", () => {
    const report = computeDayReport(
      [
        entry("a", t(9, 0), t(9, 30), { id: "A", ticket: ticketX, project: projectClear }),
        entry("b", t(10, 0), t(10, 30), { id: "B", project: projectClear }),
        entry("c", t(11, 0), t(11, 30), { id: "C" }),
      ],
      products,
      dayStart,
      dayEnd,
    );
    expect(report.entries.map((e) => e.productId)).toEqual(["prod-exp", "prod-clear", null]);
    expect(report.byProduct.find((r) => r.productId === null)).toEqual({
      productId: null,
      name: "Unassigned",
      minutes: 30,
    });
    expect(report.unassignedCount).toBe(1);
    expect(report.byAction.find((r) => r.actionId === "A")?.ticket?.shortId).toBe("windy.moose");
  });

  it("agent-run time is excluded from attention and roll-ups and reported on its own", () => {
    const report = computeDayReport(
      [
        entry("a", t(9, 0), t(10, 0), { id: "A", ticket: ticketX }),
        entry("r", t(9, 0), t(12, 0), { id: "A", ticket: ticketX }, { source: "agent-run" }),
      ],
      products,
      dayStart,
      dayEnd,
    );
    expect(report.attentionMinutes).toBe(60);
    expect(report.sessionMinutes).toBe(60);
    expect(report.agentRunMinutes).toBe(180);
    expect(report.byProduct).toEqual([{ productId: "prod-exp", name: "Exponential", minutes: 60 }]);
    expect(report.byAction[0]).toMatchObject({ actionId: "A", minutes: 60, agentRunMinutes: 180 });
    expect(report.entries.find((e) => e.id === "r")?.isAgentRun).toBe(true);
  });

  it("clamps to the day window, treats a running entry as ending now, drops entries outside", () => {
    const now = t(10, 0);
    const report = computeDayReport(
      [
        entry("late", new Date("2026-09-10T23:30:00Z"), t(0, 30), { id: "A" }), // 30 inside
        entry("running", t(9, 0), null, { id: "B" }, { source: "plugin", status: "CONFIRMED" }), // 60 to now
        entry("gone", new Date("2026-09-10T08:00:00Z"), new Date("2026-09-10T09:00:00Z"), { id: "C" }),
      ],
      products,
      dayStart,
      dayEnd,
      now,
    );
    expect(report.entries.map((e) => [e.id, e.minutes])).toEqual([
      ["late", 30],
      ["running", 60],
    ]);
    expect(report.attentionMinutes).toBe(90);
  });

  it("counts proposed entries and carries the forgotten-timer flag", () => {
    const report = computeDayReport(
      [
        entry("a", t(9, 0), t(10, 30), { id: "A" }),
        entry("m", t(10, 0), t(11, 31), { id: "B" }, { source: "plugin", status: "CONFIRMED" }),
      ],
      products,
      dayStart,
      dayEnd,
    );
    expect(report.proposedCount).toBe(1);
    expect(report.flags).toEqual([{ entryId: "m", flag: "forgotten-timer" }]);
  });

  it("an empty day is all zeros", () => {
    const report = computeDayReport([], products, dayStart, dayEnd);
    expect(report).toMatchObject({
      attentionMinutes: 0,
      sessionMinutes: 0,
      agentRunMinutes: 0,
      byProduct: [],
      byAction: [],
      unassignedCount: 0,
      proposedCount: 0,
      flags: [],
    });
  });

  it("handles 100 entries well inside the 500 ms budget", () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      entry(`e${i}`, t(8 + (i % 8), (i * 7) % 60), t(9 + (i % 8), (i * 11) % 60), {
        id: `A${i % 10}`,
        ticket: i % 2 ? ticketX : undefined,
      }),
    );
    const started = performance.now();
    const report = computeDayReport(rows, products, dayStart, dayEnd);
    expect(performance.now() - started).toBeLessThan(500);
    expect(report.byProduct.reduce((s, r) => s + r.minutes, 0)).toBeGreaterThan(0);
  });
});
