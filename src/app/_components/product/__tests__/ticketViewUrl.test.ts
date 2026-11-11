import { describe, it, expect } from "vitest";
import { EMPTY_TICKET_FILTERS, type TicketFilters } from "../ticketFilters";
import {
  buildTicketViewParams,
  hasTicketViewParams,
  isCompleteTicketView,
  parseTicketViewParams,
  ticketViewQueryString,
  withoutTicketViewParams,
  type TicketViewState,
} from "../ticketViewUrl";

const q = (s: string) => new URLSearchParams(s);

const FULL_FILTERS: TicketFilters = {
  status: ["BACKLOG", "IN_PROGRESS", "BLOCKED"],
  priority: ["1", "none"],
  type: ["BUG", "FEATURE"],
  assignee: ["cmuser0000001", "none"],
  epic: ["cmepic0000001"],
  cycle: ["cmcycle000001", "none"],
  labels: ["cmtag00000001", "cmtag00000002"],
};

const FULL_STATE: TicketViewState = {
  filters: FULL_FILTERS,
  sortField: "priority",
  sortDir: "desc",
  groupBy: "cycle",
  layout: "board",
  entity: "tickets",
  nestDependencies: true,
};

describe("ticketViewUrl", () => {
  it("returns null when the query carries no view", () => {
    expect(parseTicketViewParams(q(""))).toBeNull();
    expect(parseTicketViewParams(q("peek=cmticket00001&foo=bar"))).toBeNull();
    expect(hasTicketViewParams(q("peek=x"))).toBe(false);
  });

  it("round-trips every facet and setting without loss", () => {
    const params = buildTicketViewParams(FULL_STATE);
    expect(parseTicketViewParams(params)).toEqual(FULL_STATE);
  });

  it("round-trips an empty filter set as an explicit view", () => {
    const state: TicketViewState = { ...FULL_STATE, filters: EMPTY_TICKET_FILTERS };
    const parsed = parseTicketViewParams(buildTicketViewParams(state));
    expect(parsed).toEqual(state);
  });

  it("builds complete views and treats partial ones as incomplete", () => {
    expect(isCompleteTicketView(FULL_STATE)).toBe(true);
    const partial = parseTicketViewParams(q("status=BLOCKED"))!;
    expect(isCompleteTicketView(partial)).toBe(false);
  });

  it("reads the Overview's ?status= deep link as a status facet", () => {
    const parsed = parseTicketViewParams(q("status=BLOCKED"));
    expect(parsed?.filters).toEqual({ ...EMPTY_TICKET_FILTERS, status: ["BLOCKED"] });
    expect(parsed?.sortField).toBeUndefined();
    expect(parsed?.layout).toBeUndefined();
  });

  it("resolves ?assignee=me to the session user, and keeps 'me' until it is known", () => {
    expect(parseTicketViewParams(q("assignee=me"), { sessionUserId: "cmme000000001" })?.filters.assignee)
      .toEqual(["cmme000000001"]);
    expect(parseTicketViewParams(q("assignee=me"))?.filters.assignee).toEqual(["me"]);
  });

  it("drops malformed values instead of throwing", () => {
    const parsed = parseTicketViewParams(
      q("status=BLOCKED,NOT_A_STATUS,,&type=bug&priority=high,2&labels=has space,cmtag1&sort=nope:desc&layout=grid&entity=both&nest=yes&group=area"),
      { groupByValues: ["none", "status"] },
    );
    expect(parsed).toEqual({
      filters: { ...EMPTY_TICKET_FILTERS, status: ["BLOCKED"], priority: ["2"], labels: ["cmtag1"] },
    });
  });

  it("dedupes repeated values and defaults a bare sort to ascending", () => {
    const parsed = parseTicketViewParams(q("status=BLOCKED,BLOCKED&sort=title"));
    expect(parsed?.filters.status).toEqual(["BLOCKED"]);
    expect(parsed?.sortField).toBe("title");
    expect(parsed?.sortDir).toBe("asc");
  });

  it("keeps params that are not part of the view, such as peek", () => {
    const params = buildTicketViewParams(FULL_STATE, q("peek=cmticket00001&status=DONE"));
    expect(params.get("peek")).toBe("cmticket00001");
    expect(params.get("status")).toBe("BACKLOG,IN_PROGRESS,BLOCKED");
    expect(withoutTicketViewParams(params).toString()).toBe("peek=cmticket00001");
  });

  it("writes readable commas and colons in the query string", () => {
    const qs = ticketViewQueryString(buildTicketViewParams({
      filters: { ...EMPTY_TICKET_FILTERS, status: ["BACKLOG", "BLOCKED"] },
      sortField: "priority",
      sortDir: "desc",
    }));
    expect(qs).toBe("status=BACKLOG,BLOCKED&sort=priority:desc");
    const parsed = parseTicketViewParams(q(qs));
    expect(parsed?.filters.status).toEqual(["BACKLOG", "BLOCKED"]);
    expect(parsed?.sortDir).toBe("desc");
  });
});
