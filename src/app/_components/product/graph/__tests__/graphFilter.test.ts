import { describe, it, expect } from "vitest";
import { applyGraphFilter } from "../graphFilter";
import {
  EMPTY_TICKET_FILTERS,
  matchesTicketFilters,
  type TicketFilters,
} from "~/app/_components/product/ticketFilters";
import type {
  DependencyGraphBlockingEdge,
  DependencyGraphTicket,
} from "~/plugins/product/server/services/DependencyGraphService";

function ticket(
  id: string,
  cycle: { id: string; name: string } | null,
  extra: Partial<DependencyGraphTicket> = {},
): DependencyGraphTicket {
  return {
    id,
    number: 1,
    shortId: id,
    title: `Ticket ${id}`,
    status: "BACKLOG",
    type: "FEATURE",
    priority: null,
    points: null,
    featureId: null,
    cycle,
    epic: null,
    assignee: null,
    tags: [],
    openBlockerCount: 0,
    isBlocked: false,
    ...extra,
  };
}

const sprint11 = { id: "c11", name: "Sprint 11" };
const sprint12 = { id: "c12", name: "Sprint 12" };

/** The Backlog's facet predicate for a cycle id ("none" = no cycle). */
const byCycle = (...cycleValues: string[]) => {
  const filters: TicketFilters = { ...EMPTY_TICKET_FILTERS, cycle: cycleValues };
  return (t: DependencyGraphTicket) => matchesTicketFilters(t, filters);
};

describe("applyGraphFilter", () => {
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

  it("passes everything through undimmed with no filter", () => {
    const result = applyGraphFilter(tickets, edges, null);
    expect(result.tickets).toEqual(tickets);
    expect(result.dimmedTicketIds.size).toBe(0);
  });

  it("keeps the matching tickets plus dimmed 1-hop non-matching blockers", () => {
    const result = applyGraphFilter(tickets, edges, byCycle("c12"));
    expect(result.tickets.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(Array.from(result.dimmedTicketIds).sort()).toEqual(["a", "d"]);
  });

  it("does not pull in downstream dependents", () => {
    // Sprint 11 contains only "a"; "b" depends on it but must stay hidden.
    const result = applyGraphFilter(tickets, edges, byCycle("c11"));
    expect(result.tickets.map((t) => t.id)).toEqual(["a"]);
    expect(result.dimmedTicketIds.size).toBe(0);
  });

  it("does not follow blocking chains transitively", () => {
    // Filtering to "no cycle" keeps d and its direct blocker b — but not a,
    // which only blocks d via b.
    const result = applyGraphFilter(tickets, edges, byCycle("none"));
    expect(result.tickets.map((t) => t.id)).toEqual(["b", "d"]);
    expect(Array.from(result.dimmedTicketIds)).toEqual(["b"]);
  });

  it("ignores edges whose blocker is not in the ticket set", () => {
    // e.g. the blocker was excluded upstream by includeCompleted: false.
    const result = applyGraphFilter(
      tickets,
      [...edges, { fromTicketId: "ghost", toTicketId: "b" }],
      byCycle("c12"),
    );
    expect(result.dimmedTicketIds.has("ghost")).toBe(false);
    expect(result.tickets.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("never dims blockers that match the filter themselves", () => {
    // b and c are both Sprint 12; add an in-cycle edge b→c.
    const result = applyGraphFilter(
      tickets,
      [...edges, { fromTicketId: "b", toTicketId: "c" }],
      byCycle("c12"),
    );
    expect(result.dimmedTicketIds.has("b")).toBe(false);
  });

  it("combines facets the way the Backlog does (every applied facet must match)", () => {
    const filters: TicketFilters = {
      ...EMPTY_TICKET_FILTERS,
      type: ["BUG"],
      assignee: ["u1"],
    };
    const list = [
      ticket("bug-mine", null, { type: "BUG", assignee: { id: "u1", name: "Me", image: null } }),
      ticket("bug-theirs", null, { type: "BUG", assignee: { id: "u2", name: "Them", image: null } }),
      ticket("feat-mine", null, { assignee: { id: "u1", name: "Me", image: null } }),
    ];
    const result = applyGraphFilter(list, [], (t) => matchesTicketFilters(t, filters));
    expect(result.tickets.map((t) => t.id)).toEqual(["bug-mine"]);
  });

  it("matches labels when any applied label is on the ticket", () => {
    const filters: TicketFilters = { ...EMPTY_TICKET_FILTERS, labels: ["l-api"] };
    const list = [
      ticket("tagged", null, { tags: [{ tag: { id: "l-api", name: "api" } }] }),
      ticket("untagged", null),
    ];
    const result = applyGraphFilter(list, [], (t) => matchesTicketFilters(t, filters));
    expect(result.tickets.map((t) => t.id)).toEqual(["tagged"]);
  });
});
