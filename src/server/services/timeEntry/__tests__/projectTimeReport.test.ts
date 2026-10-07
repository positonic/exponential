import { describe, it, expect } from "vitest";
import { computeProjectTimeReport, type ProjectTimeEntryInput } from "../projectTimeReport";

const t = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 7, h, m));
const ana = { id: "u-ana", name: "Ana", image: null };
const ben = { id: "u-ben", name: "Ben", image: null };

function entry(
  user: ProjectTimeEntryInput["user"],
  start: Date,
  end: Date | null,
  extra: Partial<ProjectTimeEntryInput> = {},
): ProjectTimeEntryInput {
  return {
    userId: user.id,
    startedAt: start,
    endedAt: end,
    source: "manual",
    status: "CONFIRMED",
    user,
    ...extra,
  };
}

describe("computeProjectTimeReport", () => {
  it("sums confirmed time in total and per person, most time first", () => {
    const report = computeProjectTimeReport([
      entry(ana, t(9), t(10)),
      entry(ben, t(9), t(12)),
      entry(ana, t(13), t(13, 30)),
    ]);

    expect(report.confirmedMinutes).toBe(270);
    expect(report.entryCount).toBe(3);
    expect(report.people.map((p) => [p.name, p.confirmedMinutes, p.entryCount])).toEqual([
      ["Ben", 180, 1],
      ["Ana", 90, 2],
    ]);
    expect(report.people[1]?.lastLoggedAt).toEqual(t(13));
  });

  it("keeps proposed time beside confirmed time, never folded in", () => {
    const report = computeProjectTimeReport([
      entry(ana, t(9), t(10)),
      entry(ana, t(10), t(10, 45), { status: "PROPOSED" }),
    ]);
    expect(report.confirmedMinutes).toBe(60);
    expect(report.proposedMinutes).toBe(45);
    expect(report.people[0]).toMatchObject({ confirmedMinutes: 60, proposedMinutes: 45 });
  });

  it("keeps agent-run time off the per-person rows", () => {
    const report = computeProjectTimeReport([
      entry(ana, t(9), t(10)),
      entry(ana, t(9), t(11), { source: "agent-run", status: "PROPOSED" }),
    ]);
    expect(report.agentRunMinutes).toBe(120);
    expect(report.confirmedMinutes).toBe(60);
    expect(report.proposedMinutes).toBe(0);
    expect(report.people).toHaveLength(1);
  });

  it("counts a running entry up to now", () => {
    const report = computeProjectTimeReport([entry(ben, t(9), null)], t(9, 20));
    expect(report.confirmedMinutes).toBe(20);
  });

  it("returns an empty report for no entries", () => {
    expect(computeProjectTimeReport([])).toEqual({
      confirmedMinutes: 0,
      proposedMinutes: 0,
      agentRunMinutes: 0,
      entryCount: 0,
      people: [],
    });
  });
});
