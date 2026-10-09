import { describe, expect, it } from "vitest";
import {
  computeDeliveryFlow,
  computeSizeCalibration,
  cycleTimesMs,
  percentile,
  startedAtFromEvents,
  statusMovesFromEvents,
  weeklyCompleted,
  type StatusMove,
} from "../deliveryFlow";

const d = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe("percentile", () => {
  it("is null for no values and exact for one", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.85)).toBe(7);
  });
  it("interpolates between ranks and matches the median at p=0.5", () => {
    expect(percentile([4, 1, 2, 3], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 0.85)).toBeCloseTo(4.4);
    expect(percentile([10, 20], 1)).toBe(20);
    expect(percentile([10, 20], 0)).toBe(10);
  });
});

describe("startedAtFromEvents / cycleTimesMs", () => {
  const moves: StatusMove[] = [
    { ticketId: "a", to: "IN_PROGRESS", at: d("2026-09-01T09:00:00Z") },
    { ticketId: "a", to: "DONE", at: d("2026-09-01T13:00:00Z") },
    { ticketId: "a", to: "IN_PROGRESS", at: d("2026-09-02T09:00:00Z") },
    { ticketId: "a", to: "DONE", at: d("2026-09-03T09:00:00Z") },
    { ticketId: "b", to: "DONE", at: d("2026-09-04T09:00:00Z") },
  ];
  it("keeps the first start of a reopened ticket", () => {
    expect(startedAtFromEvents(moves).get("a")).toEqual(d("2026-09-01T09:00:00Z"));
    expect(startedAtFromEvents(moves).has("b")).toBe(false);
  });
  it("yields one span per ticket that has both a start and a finish", () => {
    const started = startedAtFromEvents(moves);
    expect(
      cycleTimesMs(
        [
          { id: "a", finishedAt: d("2026-09-03T09:00:00Z") },
          { id: "b", finishedAt: d("2026-09-04T09:00:00Z") },
          { id: "c", finishedAt: null },
        ],
        started,
      ),
    ).toEqual([48 * HOUR]);
  });
});

describe("statusMovesFromEvents", () => {
  it("reads metadata.to and skips rows without one", () => {
    expect(
      statusMovesFromEvents([
        { entityId: "t", metadata: { from: "QA", to: "DONE" }, createdAt: d("2026-09-01") },
        { entityId: "t", metadata: { fieldsChanged: ["title"] }, createdAt: d("2026-09-02") },
        { entityId: "t", metadata: null, createdAt: d("2026-09-03") },
      ]),
    ).toEqual([{ ticketId: "t", to: "DONE", at: d("2026-09-01") }]);
  });
});

describe("weeklyCompleted across a year boundary", () => {
  it("buckets by 7-day windows ending today, oldest first", () => {
    const now = d("2027-01-05T12:00:00Z");
    const weeks = weeklyCompleted(
      [d("2026-12-30T10:00:00Z"), d("2027-01-04T10:00:00Z"), d("2026-12-20T10:00:00Z")],
      now,
      3,
    );
    expect(weeks.map((w) => w.weekStart.toISOString().slice(0, 10))).toEqual([
      "2026-12-16",
      "2026-12-23",
      "2026-12-30",
    ]);
    expect(weeks.map((w) => w.count)).toEqual([1, 0, 2]);
  });
});

describe("computeDeliveryFlow", () => {
  const now = d("2026-10-09T12:00:00Z");
  const tickets = [
    // finished by event inside the window, started 2 days earlier
    { id: "a", status: "DONE", completedAt: d("2026-10-08T00:00:00Z"), updatedAt: d("2026-10-08T00:00:00Z") },
    // reopened and re-done: counted once, at the second finish
    { id: "b", status: "DEPLOYED", completedAt: d("2026-10-09T00:00:00Z"), updatedAt: d("2026-10-09T00:00:00Z") },
    // no events: falls back to completedAt
    { id: "c", status: "DONE", completedAt: d("2026-10-01T00:00:00Z"), updatedAt: d("2026-10-02T00:00:00Z") },
    // finished long ago, edited yesterday: must NOT count
    { id: "d", status: "DONE", completedAt: d("2026-05-01T00:00:00Z"), updatedAt: d("2026-10-08T00:00:00Z") },
    // not completed
    { id: "e", status: "IN_PROGRESS", completedAt: null, updatedAt: d("2026-10-08T00:00:00Z") },
  ];
  const moves: StatusMove[] = [
    { ticketId: "a", to: "IN_PROGRESS", at: d("2026-10-05T10:00:00Z") },
    { ticketId: "a", to: "DONE", at: d("2026-10-07T10:00:00Z") },
    { ticketId: "b", to: "IN_PROGRESS", at: d("2026-09-30T10:00:00Z") },
    { ticketId: "b", to: "DONE", at: d("2026-10-01T10:00:00Z") },
    { ticketId: "b", to: "IN_PROGRESS", at: d("2026-10-02T10:00:00Z") },
    { ticketId: "b", to: "DONE", at: d("2026-10-03T10:00:00Z") },
    { ticketId: "b", to: "DEPLOYED", at: d("2026-10-04T10:00:00Z") },
    { ticketId: "d", to: "DONE", at: d("2026-05-01T10:00:00Z") },
    { ticketId: "e", to: "IN_PROGRESS", at: d("2026-10-08T10:00:00Z") },
  ];

  it("counts each completion once, by its event-log finish, inside the window", () => {
    const r = computeDeliveryFlow(tickets, moves, now, 4);
    expect(r.completedInWindow).toBe(3);
    expect(r.datedByEvents).toBe(2);
    expect(r.throughput).toHaveLength(4);
    expect(r.throughput.reduce((s, w) => s + w.completed, 0)).toBe(3);
    expect(r.recentWeeklyAverage).toBe(0.75);
  });

  it("reports cycle-time percentiles only with enough samples", () => {
    const r = computeDeliveryFlow(tickets, moves, now, 4);
    // a: 48h, b: first start 09-30 -> finish 10-03 = 72h; c has no start.
    expect(r.cycleTime.sampleSize).toBe(2);
    expect(r.cycleTime.p50Hours).toBeNull();
    expect(r.cycleTime.p85Hours).toBeNull();

    const more = computeDeliveryFlow(
      [...tickets, { id: "f", status: "DONE", completedAt: null, updatedAt: d("2026-10-08T00:00:00Z") }],
      [
        ...moves,
        { ticketId: "f", to: "IN_PROGRESS", at: d("2026-10-06T00:00:00Z") },
        { ticketId: "f", to: "DONE", at: d("2026-10-06T24:00:00Z") },
      ],
      now,
      4,
    );
    expect(more.cycleTime.sampleSize).toBe(3);
    expect(more.cycleTime.p50Hours).toBe(48);
    expect(more.cycleTime.p85Hours).toBeCloseTo(64.8);
  });
});


describe("computeSizeCalibration", () => {
  const ref = (id: string) => ({ id, urlId: id, displayId: id.toUpperCase(), title: id, productSlug: "p" });
  const H = 3_600_000;
  const label = (points: number) => ({ 1: "XS", 2: "S", 3: "M" })[points] ?? String(points);

  it("buckets by size in points order, with Unsized last, and needs 3 samples for percentiles", () => {
    const r = computeSizeCalibration(
      [
        { ticket: { id: "m1", status: "DONE", completedAt: null, updatedAt: new Date(), points: 3, ref: ref("m1") }, cycleTimeMs: 10 * H },
        { ticket: { id: "m2", status: "DONE", completedAt: null, updatedAt: new Date(), points: 3, ref: ref("m2") }, cycleTimeMs: 20 * H },
        { ticket: { id: "m3", status: "DONE", completedAt: null, updatedAt: new Date(), points: 3, ref: ref("m3") }, cycleTimeMs: 30 * H },
        { ticket: { id: "m4", status: "DONE", completedAt: null, updatedAt: new Date(), points: 3, ref: ref("m4") }, cycleTimeMs: null },
        { ticket: { id: "s1", status: "DONE", completedAt: null, updatedAt: new Date(), points: 2, ref: ref("s1") }, cycleTimeMs: 5 * H },
        { ticket: { id: "u1", status: "DONE", completedAt: null, updatedAt: new Date(), points: null, ref: ref("u1") }, cycleTimeMs: 50 * H },
      ],
      label,
    );
    expect(r.buckets.map((b) => b.label)).toEqual(["S", "M", "Unsized"]);
    expect(r.buckets[1]).toMatchObject({ count: 4, sampleSize: 3, p50Hours: 20 });
    expect(r.buckets[1]?.p85Hours).toBeCloseTo(27);
    expect(r.buckets[0]).toMatchObject({ count: 1, sampleSize: 1, p50Hours: null, p85Hours: null });
    expect(r.sized).toBe(5);
    expect(r.completed).toBe(6);
  });

  it("flags tickets above their bucket's p85, worst first, never from the Unsized bucket", () => {
    const mk = (id: string, points: number | null, hours: number) => ({
      ticket: { id, status: "DONE", completedAt: null, updatedAt: new Date(), points, ref: ref(id) },
      cycleTimeMs: hours * H,
    });
    const r = computeSizeCalibration(
      [mk("a", 1, 1), mk("b", 1, 1), mk("c", 1, 1), mk("d", 1, 40), mk("e", 1, 10), mk("u", null, 500), mk("v", null, 600), mk("w", null, 700)],
      label,
    );
    // sorted [1,1,1,10,40]: p85 = 22h, so only d (40h) is past it.
    expect(r.outliers.map((o) => o.ticket.id)).toEqual(["d"]);
    expect(r.outliers[0]).toMatchObject({ size: "XS", cycleTimeHours: 40 });
    expect(r.outliers[0]!.cycleTimeHours).toBeGreaterThan(r.outliers[0]!.bucketP85Hours);
  });
});
