import { describe, expect, it } from "vitest";
import {
  computeBurnup,
  computeCriticalPath,
  computeWaitingOn,
  findBottleneck,
  isSlipping,
  median,
  parsePrUrl,
  stageOf,
  summarizeStages,
  weeklyCompleted,
  type StageTicket,
} from "../managerOverview";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("stageOf", () => {
  it("treats QA as the review stage", () => {
    expect(stageOf("QA")).toBe("inReview");
    expect(stageOf("IN_PROGRESS")).toBe("inProgress");
  });
  it("maps not-started statuses to committed and BLOCKED to in progress", () => {
    expect(stageOf("READY_TO_PLAN")).toBe("committed");
    expect(stageOf("BLOCKED")).toBe("inProgress");
    expect(stageOf("DEPLOYED")).toBe("deployed");
    expect(stageOf("ARCHIVED")).toBeNull();
  });
});

function st(stage: StageTicket["stage"], ageMs: number, isAgent = false): StageTicket {
  return { id: `${stage}-${ageMs}-${String(isAgent)}`, stage, ageMs, isAgent };
}

describe("summarizeStages / findBottleneck", () => {
  it("averages ages per stage and omits ages for deployed", () => {
    const s = summarizeStages([st("inReview", 2 * DAY), st("inReview", 4 * DAY), st("deployed", DAY)]);
    const qa = s.find((x) => x.key === "inReview")!;
    expect(qa.count).toBe(2);
    expect(qa.avgAgeMs).toBe(3 * DAY);
    expect(qa.agesMs).toEqual([4 * DAY, 2 * DAY]);
    expect(s.find((x) => x.key === "deployed")!.agesMs).toEqual([]);
  });

  it("picks the in-flight stage with the most accumulated wait", () => {
    const b = findBottleneck([
      st("inReview", 2 * DAY, true),
      st("inReview", 2 * DAY),
      st("inReview", 1 * DAY, true),
      st("inProgress", 3 * DAY),
      st("inProgress", 1 * DAY),
    ]);
    expect(b).toMatchObject({ stage: "inReview", count: 3, agentCount: 2 });
  });

  it("returns null when nothing waits a day on average", () => {
    expect(findBottleneck([st("inReview", HOUR), st("inReview", 2 * HOUR)])).toBeNull();
  });
});

describe("computeWaitingOn", () => {
  it("separates reviews, agent building and blocked", () => {
    expect(
      computeWaitingOn([
        { stage: "inReview", status: "QA", isAgent: true },
        { stage: "inReview", status: "QA", isAgent: false },
        { stage: "inProgress", status: "IN_PROGRESS", isAgent: true },
        { stage: "inProgress", status: "IN_PROGRESS", isAgent: false },
        { stage: "inProgress", status: "BLOCKED", isAgent: false },
      ]),
    ).toEqual({ people: 2, agents: 1, blocked: 1 });
  });
});

describe("computeBurnup", () => {
  const cycle = { startDate: d("2026-09-28"), endDate: d("2026-10-11") };

  it("builds scope and done lines up to today and projects the finish", () => {
    const tickets = [
      { addedAt: d("2026-09-28"), doneAt: d("2026-09-29") },
      { addedAt: d("2026-09-28"), doneAt: d("2026-10-02") },
      { addedAt: d("2026-09-28"), doneAt: null },
      { addedAt: d("2026-10-01"), doneAt: null }, // added mid-cycle
    ];
    const b = computeBurnup(cycle, tickets, d("2026-10-04"));
    expect(b.totalDays).toBe(14);
    expect(b.dayNumber).toBe(7);
    expect(b.points).toHaveLength(7);
    expect(b.points[0]).toEqual({ day: 0, scope: 3, done: 0 });
    expect(b.points[6]).toEqual({ day: 6, scope: 4, done: 2 });
    expect(b.addedMidCycle).toBe(1);
    expect(b.idealToday).toBe(2);
    // 2 done in 7 days -> 2 left at 2/7 a day -> 7 more days -> day 13 = last day.
    expect(b.projectedDaysEarly).toBe(0);
  });

  it("has no projection before anything is done", () => {
    const b = computeBurnup(cycle, [{ addedAt: d("2026-09-28"), doneAt: null }], d("2026-09-30"));
    expect(b.projectedFinishDay).toBeNull();
    expect(b.projectedDaysEarly).toBeNull();
  });
});

describe("computeCriticalPath", () => {
  it("returns the heaviest blocker chain, blocker first", () => {
    const tickets = ["a", "b", "c", "x", "y"].map((id) => ({ id, weight: 1 }));
    const edges = [
      { blockerId: "a", ticketId: "b" },
      { blockerId: "b", ticketId: "c" },
      { blockerId: "x", ticketId: "y" },
    ];
    expect(computeCriticalPath(tickets, edges)).toEqual(["a", "b", "c"]);
  });

  it("weights by points and ignores edges to unknown tickets", () => {
    const tickets = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "x", weight: 5 },
      { id: "y", weight: 1 },
    ];
    const edges = [
      { blockerId: "a", ticketId: "b" },
      { blockerId: "x", ticketId: "y" },
      { blockerId: "gone", ticketId: "a" },
    ];
    expect(computeCriticalPath(tickets, edges)).toEqual(["x", "y"]);
  });

  it("returns nothing without dependencies and survives a cycle", () => {
    expect(computeCriticalPath([{ id: "a", weight: 1 }], [])).toEqual([]);
    const loop = computeCriticalPath(
      [{ id: "a", weight: 1 }, { id: "b", weight: 1 }],
      [{ blockerId: "a", ticketId: "b" }, { blockerId: "b", ticketId: "a" }],
    );
    expect(loop.length).toBeLessThanOrEqual(2);
  });
});

describe("isSlipping", () => {
  const median = 3 * DAY;
  it("flags a not-started ticket when the median no longer fits before the due date", () => {
    expect(isSlipping("committed", 0, median, 2 * DAY)).toBe(true);
    expect(isSlipping("committed", 0, median, 4 * DAY)).toBe(false);
  });
  it("uses what is left of the median for started work, with a floor", () => {
    expect(isSlipping("inProgress", 2 * DAY, median, 2 * DAY)).toBe(false); // 1d left
    expect(isSlipping("inProgress", 5 * DAY, median, 12 * HOUR)).toBe(true); // floor 18h
  });
  it("never flags review or tickets without enough history", () => {
    expect(isSlipping("inReview", 9 * DAY, median, HOUR)).toBe(false);
    expect(isSlipping("committed", 0, null, HOUR)).toBe(false);
  });
});

describe("helpers", () => {
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("weeklyCompleted buckets the last N weeks, oldest first", () => {
    const now = d("2026-10-04");
    const w = weeklyCompleted([d("2026-10-03"), d("2026-10-01"), d("2026-09-20")], now, 3);
    expect(w.map((x) => x.count)).toEqual([1, 0, 2]);
  });

  it("parsePrUrl", () => {
    expect(parsePrUrl("https://github.com/acme/app/pull/418")).toEqual({ repo: "acme/app", number: 418 });
    expect(parsePrUrl("https://example.com/x")).toBeNull();
  });
});
