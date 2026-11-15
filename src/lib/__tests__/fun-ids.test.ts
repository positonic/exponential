import { describe, expect, it } from "vitest";
import {
  isTicketIdMatch,
  parseTicketIdQuery,
  parseTicketUrlId,
  shortIdMatchesQuery,
  shortIdSearchWhere,
  ticketIdWhere,
  ticketUrlId,
} from "../fun-ids";

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

  it("matches a dotted fun id word-order-insensitively", () => {
    expect(shortIdSearchWhere("toucan.prime")).toEqual([
      { AND: [contains("toucan"), contains("prime")] },
    ]);
  });

  it("splits on whitespace too", () => {
    expect(shortIdSearchWhere("toucan prime")).toEqual([
      { AND: [contains("toucan"), contains("prime")] },
    ]);
  });

  it("ignores empty segments from stray separators", () => {
    expect(shortIdSearchWhere("toucan..prime ")).toEqual([
      { AND: [contains("toucan"), contains("prime")] },
    ]);
  });

  it("drops a trailing separator from a one-word query", () => {
    expect(shortIdSearchWhere("toucan.")).toEqual([contains("toucan")]);
  });

  it("returns no clauses for a separator-only query", () => {
    expect(shortIdSearchWhere(".")).toEqual([]);
    expect(shortIdSearchWhere(" . ")).toEqual([]);
  });

  it("keeps single-letter word pairs as a plain substring match", () => {
    expect(shortIdSearchWhere("a b")).toEqual([contains("a b")]);
  });

  it("treats three or more words as title-style text, not a fun id", () => {
    expect(shortIdSearchWhere("fix the search bug")).toEqual([
      contains("fix the search bug"),
    ]);
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

describe("parseTicketIdQuery", () => {
  it("only reads a number that fits Ticket.number (a 32-bit Int) as a ticket number", () => {
    expect(parseTicketIdQuery("2147483647").number).toBe(2147483647);
    expect(parseTicketIdQuery("2147483648").number).toBeNull();
    expect(parseTicketIdQuery("E-99999999999").number).toBeNull();
    expect(parseTicketIdQuery("#2147483648").number).toBeNull();
  });

  it("reads an exact fun shortId in both word orders", () => {
    expect(parseTicketIdQuery("snappy.thunder")).toEqual({
      shortIds: ["snappy.thunder", "thunder.snappy"],
      number: null,
      linearPrefix: null,
    });
  });

  it("tolerates case, surrounding whitespace and a space for the dot", () => {
    const expected = ["snappy.thunder", "thunder.snappy"];
    expect(parseTicketIdQuery("  Snappy.THUNDER ").shortIds).toEqual(expected);
    expect(parseTicketIdQuery("snappy   thunder").shortIds).toEqual(expected);
    expect(parseTicketIdQuery("thunder snappy").shortIds).toEqual(["thunder.snappy", "snappy.thunder"]);
  });

  it("reads the collision fallback form adjective.noun.NN", () => {
    expect(parseTicketIdQuery("swift.falcon.42").shortIds).toEqual(["swift.falcon.42", "falcon.swift.42"]);
  });

  it("reads a number, a #number and a Linear-style id", () => {
    expect(parseTicketIdQuery("42")).toEqual({ shortIds: [], number: 42, linearPrefix: null });
    expect(parseTicketIdQuery(" #42 ")).toEqual({ shortIds: [], number: 42, linearPrefix: null });
    expect(parseTicketIdQuery("exp-42")).toEqual({ shortIds: [], number: 42, linearPrefix: "EXP" });
  });

  it("names nothing for title text, one word, or a zero", () => {
    const none = { shortIds: [], number: null, linearPrefix: null };
    expect(parseTicketIdQuery("fix the search bug")).toEqual(none);
    expect(parseTicketIdQuery("thunder")).toEqual(none);
    expect(parseTicketIdQuery("a b")).toEqual(none);
    expect(parseTicketIdQuery("0")).toEqual(none);
    expect(parseTicketIdQuery("")).toEqual(none);
  });
});

describe("ticketIdWhere", () => {
  it("builds exact shortId and number clauses", () => {
    expect(ticketIdWhere(parseTicketIdQuery("snappy.thunder"))).toEqual([
      { shortId: { in: ["snappy.thunder", "thunder.snappy"] } },
    ]);
    expect(ticketIdWhere(parseTicketIdQuery("EXP-42"))).toEqual([{ number: 42 }]);
  });

  it("is empty when the query names no ticket", () => {
    expect(ticketIdWhere(parseTicketIdQuery("fix search bug"))).toEqual([]);
  });
});

describe("isTicketIdMatch", () => {
  const ticket = { shortId: "snappy.thunder", number: 42 };

  it("matches the shortId whatever the case or word order", () => {
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("THUNDER snappy"))).toBe(true);
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("snappy.falcon"))).toBe(false);
  });

  it("matches the number, and a Linear prefix only in its own product", () => {
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("#42"))).toBe(true);
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("43"))).toBe(false);
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("e-42"), "Exponential")).toBe(true);
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("fp-42"), "Exponential")).toBe(false);
    // Without the product name a prefixed id cannot be checked, so it never matches.
    expect(isTicketIdMatch(ticket, parseTicketIdQuery("e-42"))).toBe(false);
  });
});

describe("shortIdMatchesQuery", () => {
  it("mirrors shortIdSearchWhere: one word is a substring, two words in any order", () => {
    expect(shortIdMatchesQuery("snappy.thunder", "thund")).toBe(true);
    expect(shortIdMatchesQuery("snappy.thunder", "Thunder.Snappy")).toBe(true);
    expect(shortIdMatchesQuery("snappy.thunder", " snappy thunder ")).toBe(true);
    expect(shortIdMatchesQuery("snappy.thunder", "snappy falcon")).toBe(false);
  });

  it("never matches a missing shortId or a separators-only query", () => {
    expect(shortIdMatchesQuery(null, "snappy")).toBe(false);
    expect(shortIdMatchesQuery("snappy.thunder", " . ")).toBe(false);
  });
});
