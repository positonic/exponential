import { describe, expect, it } from "vitest";
import { parseTicketUrlId, ticketUrlId } from "../fun-ids";

describe("parseTicketUrlId", () => {
  it("parses a bare number", () => {
    expect(parseTicketUrlId("29")).toBe(29);
  });

  it("parses a Linear-style id", () => {
    expect(parseTicketUrlId("PLAT-29")).toBe(29);
    expect(parseTicketUrlId("plat-29")).toBe(29);
    expect(parseTicketUrlId("ATP-14")).toBe(14);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseTicketUrlId("  29  ")).toBe(29);
  });

  it("returns null for a CUID", () => {
    expect(parseTicketUrlId("cmqf3vv1i0001l804zxzlhg8c")).toBeNull();
  });

  it("returns null for a fun shortId", () => {
    expect(parseTicketUrlId("swift.falcon")).toBeNull();
  });

  it("returns null for empty / non-numeric input", () => {
    expect(parseTicketUrlId("")).toBeNull();
    expect(parseTicketUrlId("abc")).toBeNull();
  });
});

describe("ticketUrlId", () => {
  it("prefers the sequential number when present", () => {
    expect(ticketUrlId({ id: "cmabc", number: 29 })).toBe("29");
  });

  it("falls back to the CUID for legacy tickets with number 0", () => {
    expect(ticketUrlId({ id: "cmabc", number: 0 })).toBe("cmabc");
  });

  it("round-trips with parseTicketUrlId for numbered tickets", () => {
    const id = ticketUrlId({ id: "cmabc", number: 42 });
    expect(parseTicketUrlId(id)).toBe(42);
  });
});
