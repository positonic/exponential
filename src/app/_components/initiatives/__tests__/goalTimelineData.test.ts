import { describe, it, expect } from "vitest";
import {
  buildGoalTimelineData,
  goalTimelineRange,
  type TimelineGoalInput,
} from "../goalTimelineData";

const NOW = new Date(2026, 8, 10); // 10 Sep 2026

function goal(overrides: Partial<TimelineGoalInput> = {}): TimelineGoalInput {
  return {
    id: 1,
    title: "Ship the thing",
    period: null,
    dueDate: null,
    health: null,
    progress: 0,
    depth: 0,
    owner: null,
    projects: [],
    ...overrides,
  };
}

describe("goalTimelineRange", () => {
  it("falls back to the current year when no goal is dated", () => {
    const range = goalTimelineRange([goal()], NOW);
    expect(range.start).toEqual(new Date(2026, 0, 1));
    expect(range.end).toEqual(new Date(2026, 11, 31));
  });

  it("covers every year a goal's period or due date touches", () => {
    const range = goalTimelineRange(
      [
        goal({ id: 1, period: "Q4-2025" }),
        goal({ id: 2, dueDate: new Date(2027, 2, 1) }),
      ],
      NOW,
    );
    expect(range.start.getFullYear()).toBe(2025);
    expect(range.end.getFullYear()).toBe(2027);
  });

  it("clamps a far-off target to a window around today", () => {
    const range = goalTimelineRange(
      [goal({ id: 1, period: "Q1-2024" }), goal({ id: 2, period: "Annual-2031" })],
      NOW,
    );
    expect(range.start.getFullYear()).toBe(2025);
    expect(range.end.getFullYear()).toBe(2027);
  });

  // Clamping the start before anchoring used to yield 2025–2026 here, hiding
  // 2024's goals behind a window one year narrower than it was allowed to be.
  it("uses the full window when today sits at the end of the data", () => {
    const range = goalTimelineRange(
      [
        goal({ id: 1, period: "Q1-2023" }),
        goal({ id: 2, period: "Q1-2024" }),
        goal({ id: 3, period: "Q4-2026" }),
      ],
      NOW,
    );
    expect(range.start.getFullYear()).toBe(2024);
    expect(range.end.getFullYear()).toBe(2026);
  });
});

describe("buildGoalTimelineData", () => {
  it("spans a goal's bar over its OKR period within the axis", () => {
    const { objectives, axis } = buildGoalTimelineData(
      [goal({ period: "Q3-2026", progress: 40, health: "at-risk" })],
      NOW,
    );
    const [row] = objectives;
    expect(row!.startFrac).toBeCloseTo(0.5, 1); // 1 Jul of a Jan–Dec axis
    expect(row!.endFrac).toBeCloseTo(0.75, 1); // 30 Sep
    expect(row!.progress).toBeCloseTo(0.4);
    expect(row!.status).toBe("warn");
    expect(row!.meta).toBe("40% · At risk · Q3-2026");
    expect(row!.code).toBe("");
    expect(axis?.weekCount).toBe(52);
    expect(axis?.monthLabels[0]).toBe("Jan");
  });

  it("runs a period-less goal up to its due date and labels it", () => {
    const { objectives } = buildGoalTimelineData(
      [goal({ dueDate: new Date(2026, 5, 30), progress: 100, health: "on-track" })],
      NOW,
    );
    const [row] = objectives;
    expect(row!.startFrac).toBe(0);
    expect(row!.endFrac).toBeCloseTo(0.5, 1);
    expect(row!.meta).toBe("100% · On track · due Jun 30, 2026");
    expect(row!.status).toBe("ok");
  });

  it("nests projects as sub-rows ending at the project's end date", () => {
    const { objectives } = buildGoalTimelineData(
      [
        goal({
          period: "Annual-2026",
          depth: 1,
          projects: [
            {
              id: "p1",
              name: "Launch",
              progress: 25,
              status: "ON_HOLD",
              endDate: new Date(2026, 2, 31),
            },
            { id: "p2", name: "Open ended", progress: 0, status: "ACTIVE", endDate: null },
          ],
        }),
      ],
      NOW,
    );
    const [row] = objectives;
    expect(row!.code).toBe("↳");
    expect(row!.meta).toBe("0% · No update · Annual-2026 · 2 projects");
    expect(row!.krs).toHaveLength(2);
    const [launch, open] = row!.krs;
    expect(launch!.endFrac).toBeCloseTo(0.25, 1);
    expect(launch!.status).toBe("warn");
    expect(launch!.meta).toBe("On Hold · 25%");
    expect(launch!.due).toBe("Mar 31");
    expect(launch!.owner).toBeUndefined();
    // No end date: the project runs to the end of its goal.
    expect(open!.endFrac).toBe(row!.endFrac);
    expect(open!.due).toBeUndefined();
  });

  // ADR-0004: effective status is `override ?? auto`, at every read site.
  it("resolves status as override-then-auto, falling back to key results", () => {
    const build = (
      health: string | null,
      krs?: { status: string; statusOverride?: string | null }[],
      healthOverride?: string | null,
    ) =>
      buildGoalTimelineData(
        [goal({ health, healthOverride, keyResults: krs })],
        NOW,
      ).objectives[0]!.status;

    expect(build(null)).toBe("idle");
    expect(build(null, [{ status: "on-track" }, { status: "achieved" }])).toBe("ok");
    expect(build(null, [{ status: "on-track" }, { status: "at-risk" }])).toBe("warn");
    expect(build(null, [{ status: "off-track" }, { status: "at-risk" }])).toBe("bad");
    // A goal's own health beats its key results.
    expect(build("on-track", [{ status: "off-track" }])).toBe("ok");
    // A human override beats the auto health.
    expect(build("on-track", undefined, "off-track")).toBe("bad");
    // And a key result's override beats its own auto status.
    expect(
      build(null, [{ status: "on-track", statusOverride: "off-track" }]),
    ).toBe("bad");
  });

  it("names the status in the row meta so colour is not the only signal", () => {
    const { objectives } = buildGoalTimelineData(
      [goal({ period: "Q3-2026", progress: 40, health: "at-risk" })],
      NOW,
    );
    expect(objectives[0]!.meta).toBe("40% · At risk · Q3-2026");
  });

  it("marks a goal that falls outside the clamped window", () => {
    const { objectives } = buildGoalTimelineData(
      [
        goal({ id: 1, period: "Q1-2020" }),
        goal({ id: 2, period: "Q3-2026" }),
        goal({ id: 3, period: "Annual-2027" }),
      ],
      NOW,
    );
    const clipped = objectives.find((o) => o.id === "1");
    expect(clipped!.meta).toContain("outside this view");
    expect(objectives.find((o) => o.id === "2")!.meta).not.toContain(
      "outside this view",
    );
  });

  it("hides the TODAY marker when the axis does not contain today", () => {
    const past = buildGoalTimelineData([goal({ period: "Q1-2020" })], NOW);
    expect(past.axis?.todayFrac).toBeNull();
    const current = buildGoalTimelineData([goal({ period: "Q3-2026" })], NOW);
    expect(current.axis?.todayFrac).toBeGreaterThan(0);
  });

  it("registers each goal owner once for the avatar lookup", () => {
    const owner = { id: "u1", name: "Ada" };
    const { objectives, users } = buildGoalTimelineData(
      [goal({ id: 1, owner }), goal({ id: 2, owner })],
      NOW,
    );
    expect(users.size).toBe(1);
    expect(users.get("u1")?.initials).toBe("A");
    expect(objectives.map((o) => o.owner)).toEqual(["u1", "u1"]);
  });

  it("labels Januaries with the year on a multi-year axis", () => {
    const { axis } = buildGoalTimelineData(
      [goal({ id: 1, period: "Q4-2026" }), goal({ id: 2, period: "Q1-2027" })],
      NOW,
    );
    expect(axis?.monthLabels[0]).toBe("Jan 2026");
    expect(axis?.monthLabels).toContain("Jan 2027");
    expect(axis?.monthLabels).toContain("Feb");
  });
});
