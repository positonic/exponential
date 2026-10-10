import { describe, expect, it } from "vitest";
import {
  decideCompletedAt,
  monthlyHistogram,
  planBackfill,
  type StatusMove,
} from "../backfill-ticket-completed-at";
import { finishedAtFromEvents } from "../../src/plugins/product/server/managerOverview";

const d = (iso: string) => new Date(iso);

describe("decideCompletedAt", () => {
  const moves: StatusMove[] = [
    { ticketId: "t-normal", to: "IN_PROGRESS", at: d("2026-07-01T09:00:00Z") },
    { ticketId: "t-normal", to: "DONE", at: d("2026-07-03T09:00:00Z") },
    // Bulk re-save weeks later: must NOT move the date.
    { ticketId: "t-normal", to: "DONE", at: d("2026-07-23T09:00:00Z") },

    { ticketId: "t-reopened", to: "DONE", at: d("2026-06-10T09:00:00Z") },
    { ticketId: "t-reopened", to: "IN_PROGRESS", at: d("2026-06-12T09:00:00Z") },
    { ticketId: "t-reopened", to: "DONE", at: d("2026-06-15T09:00:00Z") },
    { ticketId: "t-reopened", to: "DEPLOYED", at: d("2026-06-20T09:00:00Z") },
  ];
  const finishedAt = finishedAtFromEvents(moves);

  it("uses the first move into a completed status", () => {
    expect(
      decideCompletedAt({ id: "t-normal", status: "DONE", completedAt: d("2026-07-23T09:00:00Z") }, finishedAt),
    ).toEqual({ kind: "set", completedAt: d("2026-07-03T09:00:00Z") });
  });

  it("uses the first completion after the last reopen, not DEPLOYED", () => {
    expect(
      decideCompletedAt({ id: "t-reopened", status: "DEPLOYED", completedAt: d("2026-06-20T09:00:00Z") }, finishedAt),
    ).toEqual({ kind: "set", completedAt: d("2026-06-15T09:00:00Z") });
  });

  it("is idempotent: a ticket already carrying the event date is unchanged", () => {
    expect(
      decideCompletedAt({ id: "t-normal", status: "DONE", completedAt: d("2026-07-03T09:00:00Z") }, finishedAt),
    ).toEqual({ kind: "unchanged" });
  });

  it("leaves a completed ticket with no status event alone and says so", () => {
    expect(
      decideCompletedAt({ id: "t-no-events", status: "DONE", completedAt: d("2026-07-23T09:00:00Z") }, finishedAt),
    ).toEqual({ kind: "no-event" });
  });

  it("clears completedAt on a ticket that is not completed", () => {
    expect(
      decideCompletedAt({ id: "t-normal", status: "IN_PROGRESS", completedAt: d("2026-07-03T09:00:00Z") }, finishedAt),
    ).toEqual({ kind: "clear" });
    expect(
      decideCompletedAt({ id: "t-normal", status: "BACKLOG", completedAt: null }, finishedAt),
    ).toEqual({ kind: "unchanged" });
  });
});

describe("planBackfill", () => {
  it("decides every ticket from one pass over the events", () => {
    const plan = planBackfill(
      [
        { id: "a", status: "DONE", completedAt: d("2026-07-23T00:00:00Z") },
        { id: "b", status: "BACKLOG", completedAt: d("2026-07-23T00:00:00Z") },
        { id: "c", status: "DONE", completedAt: null },
      ],
      [{ ticketId: "a", to: "DONE", at: d("2026-07-02T00:00:00Z") }],
    );
    expect(plan.get("a")).toEqual({ kind: "set", completedAt: d("2026-07-02T00:00:00Z") });
    expect(plan.get("b")).toEqual({ kind: "clear" });
    expect(plan.get("c")).toEqual({ kind: "no-event" });
  });
});

describe("monthlyHistogram", () => {
  it("buckets by UTC month, sorted, skipping nulls", () => {
    expect(
      monthlyHistogram([d("2026-08-01T00:00:00Z"), d("2026-07-15T00:00:00Z"), null, d("2026-07-31T23:59:59Z")]),
    ).toEqual({ "2026-07": 2, "2026-08": 1 });
  });
});
