import { describe, expect, it } from "vitest";
import { parseTicketUrlId, shortIdSearchWhere, ticketUrlId } from "../fun-ids";

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

  it("rejects non-positive numbers (legacy number=0 tickets use their CUID)", () => {
    expect(parseTicketUrlId("0")).toBeNull();
    expect(parseTicketUrlId("PLAT-0")).toBeNull();
    expect(parseTicketUrlId("00")).toBeNull();
  });

  it("parses large numbers", () => {
    expect(parseTicketUrlId("999999")).toBe(999999);
    expect(parseTicketUrlId("PLAT-1000000")).toBe(1000000);
  });
});

describe("shortIdSearchWhere", () => {
  const contains = (value: string) => ({
    shortId: { contains: value, mode: "insensitive" },
  });

  it("returns a single substring clause for a one-word query", () => {
    expect(shortIdSearchWhere("toucan")).toEqual([contains("toucan")]);
  });

  it("adds an any-order clause for a dotted fun id", () => {
    expect(shortIdSearchWhere("toucan.prime")).toEqual([
      contains("toucan.prime"),
      { AND: [contains("toucan"), contains("prime")] },
    ]);
  });

  it("splits on whitespace too", () => {
    expect(shortIdSearchWhere("toucan prime")).toEqual([
      contains("toucan prime"),
      { AND: [contains("toucan"), contains("prime")] },
    ]);
  });

  it("ignores empty segments from stray separators", () => {
    expect(shortIdSearchWhere("toucan..prime ")).toEqual([
      contains("toucan..prime "),
      { AND: [contains("toucan"), contains("prime")] },
    ]);
  });

  it("treats a trailing separator as still one word", () => {
    expect(shortIdSearchWhere("toucan.")).toEqual([contains("toucan.")]);
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
