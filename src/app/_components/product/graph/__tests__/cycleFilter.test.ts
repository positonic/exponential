import { describe, it, expect } from "vitest";
import {
  applyCycleFilter,
  deriveCycleOptions,
  hasUncycledTickets,
  CYCLE_FILTER_ALL,
  CYCLE_FILTER_NONE,
} from "../cycleFilter";
import type {
  DependencyGraphBlockingEdge,
  DependencyGraphTicket,
} from "~/plugins/product/server/services/DependencyGraphService";

function ticket(
  id: string,
  cycle: { id: string; name: string } | null,
): DependencyGraphTicket {
  return {
    id,
    number: 1,
    shortId: id,
    title: `Ticket ${id}`,
    status: "BACKLOG",
    priority: null,
    points: null,
    featureId: null,
    cycle,
    assignee: null,
    openBlockerCount: 0,
    isBlocked: false,
  };
}

const sprint11 = { id: "c11", name: "Sprint 11" };
const sprint12 = { id: "c12", name: "Sprint 12" };

describe("deriveCycleOptions", () => {
  it("returns distinct cycles sorted by name", () => {
    const tickets = [
      ticket("a", sprint12),
      ticket("b", sprint11),
      ticket("c", sprint12),
      ticket("d", null),
    ];
    expect(deriveCycleOptions(tickets)).toEqual([
      { id: "c11", name: "Sprint 11" },
      { id: "c12", name: "Sprint 12" },
    ]);
  });
});

describe("hasUncycledTickets", () => {
  it("detects tickets without a cycle", () => {
    expect(hasUncycledTickets([ticket("a", sprint11)])).toBe(false);
    expect(hasUncycledTickets([ticket("a", sprint11), ticket("b", null)])).toBe(
      true,
    );
  });
});

describe("applyCycleFilter", () => {
  const tickets = [
    ticket("a", sprint11),
    ticket("b", sprint12),
    ticket("c", sprint12),
    ticket("d", null),
  ];
  // a blocks b; d blocks c; b blocks d.
  const edges: DependencyGraphBlockingEdge[] = [
    { fromTicketId: "a", toTicketId: "b" },
    { fromTicketId: "d", toTicketId: "c" },
    { fromTicketId: "b", toTicketId: "d" },
  ];

  it('passes everything through undimmed for "all"', () => {
    const result = applyCycleFilter(tickets, edges, CYCLE_FILTER_ALL);
    expect(result.tickets).toEqual(tickets);
    expect(result.dimmedTicketIds.size).toBe(0);
  });

  it("keeps a cycle's tickets plus dimmed 1-hop out-of-cycle blockers", () => {
    const result = applyCycleFilter(tickets, edges, "c12");
    expect(result.tickets.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(Array.from(result.dimmedTicketIds).sort()).toEqual(["a", "d"]);
  });

  it("does not pull in downstream dependents", () => {
    // Sprint 11 contains only "a"; "b" depends on it but must stay hidden.
    const result = applyCycleFilter(tickets, edges, "c11");
    expect(result.tickets.map((t) => t.id)).toEqual(["a"]);
    expect(result.dimmedTicketIds.size).toBe(0);
  });

  it("does not follow blocking chains transitively", () => {
    // Filtering to "no cycle" keeps d and its direct blocker b — but not a,
    // which only blocks d via b.
    const result = applyCycleFilter(tickets, edges, CYCLE_FILTER_NONE);
    expect(result.tickets.map((t) => t.id)).toEqual(["b", "d"]);
    expect(Array.from(result.dimmedTicketIds)).toEqual(["b"]);
  });

  it("never dims in-cycle blockers", () => {
    // b and c are both Sprint 12; add an in-cycle edge b→c.
    const result = applyCycleFilter(
      tickets,
      [...edges, { fromTicketId: "b", toTicketId: "c" }],
      "c12",
    );
    expect(result.dimmedTicketIds.has("b")).toBe(false);
  });
});
