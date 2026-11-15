import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { searchTicketsIdFirst } from "../ticketTextSearch";

interface Row {
  id: string;
  title: string;
  shortId: string | null;
  number: number;
  product: string;
}

/**
 * A tiny evaluator for the where shapes the search builds (OR / AND, title and
 * shortId `contains`, shortId `in`, number equality), so the tests exercise
 * what the database would return instead of asserting on clause shapes.
 */
function matches(row: Row, where: Prisma.TicketWhereInput): boolean {
  if (where.OR) return where.OR.some((w) => matches(row, w));
  if (where.AND) {
    const all = Array.isArray(where.AND) ? where.AND : [where.AND];
    return all.every((w) => matches(row, w));
  }
  if (typeof where.number === "number") return row.number === where.number;
  const title = where.title as { contains?: string } | undefined;
  if (title?.contains !== undefined) {
    return row.title.toLowerCase().includes(title.contains.toLowerCase());
  }
  const shortId = where.shortId as { contains?: string; in?: string[] } | undefined;
  if (shortId?.in) return row.shortId !== null && shortId.in.includes(row.shortId);
  if (shortId?.contains !== undefined) {
    return (row.shortId ?? "").toLowerCase().includes(shortId.contains.toLowerCase());
  }
  return true;
}

function fakeFind(rows: Row[]) {
  return vi.fn((match: Prisma.TicketWhereInput, take: number, skip = 0) =>
    Promise.resolve(rows.filter((r) => matches(r, match)).slice(skip, skip + take)),
  );
}

const row = (id: string, title: string, shortId: string | null, number: number, product = "Exponential"): Row => ({
  id,
  title,
  shortId,
  number,
  product,
});

describe("searchTicketsIdFirst", () => {
  // Most recently updated first, as the callers order them: the named ticket
  // is deliberately last, behind more than a page of word-sharing tickets.
  const rows: Row[] = [
    ...Array.from({ length: 6 }, (_, i) => row(`t${i}`, `Thunder snappy refactor ${i}`, `snappy.thunder.${i}`, 100 + i)),
    row("named", "Search doesn't find fun ids", "snappy.thunder", 42),
  ];

  it("returns the ticket an exact shortId names, first, even past the limit", async () => {
    const res = await searchTicketsIdFirst({ query: "snappy.thunder", limit: 5, find: fakeFind(rows) });
    expect(res[0]?.id).toBe("named");
    expect(res).toHaveLength(5);
  });

  it("tolerates case, whitespace and word order", async () => {
    for (const query of ["  SNAPPY.Thunder ", "thunder snappy", "Thunder.Snappy"]) {
      const res = await searchTicketsIdFirst({ query, limit: 5, find: fakeFind(rows) });
      expect(res[0]?.id, query).toBe("named");
    }
  });

  it("puts the ticket a number, #number or Linear id names first", async () => {
    const withTitle42 = [row("title42", "Upgrade to v42 of the SDK", null, 7), ...rows];
    for (const query of ["42", "#42", "e-42"]) {
      const res = await searchTicketsIdFirst({
        query,
        limit: 5,
        find: fakeFind(withTitle42),
        productName: (t) => t.product,
      });
      expect(res[0]?.id, query).toBe("named");
    }
  });

  it("ignores a number match from a product whose Linear prefix differs", async () => {
    const other = [row("other42", "Other product", null, 42, "Fixture Product"), ...rows];
    const res = await searchTicketsIdFirst({
      query: "FP-42",
      limit: 5,
      find: fakeFind(other),
      productName: (t) => t.product,
    });
    expect(res.map((t) => t.id)).toEqual(["other42"]);
  });

  it("finds a prefixed id behind more than a page of other products' same-numbered tickets", async () => {
    // 120 other products ("Other Product" -> OP) each have a ticket 42, all
    // more recently updated than Exponential's (E). One page of 50 would end
    // before it; the search keeps paging until the prefix matches.
    const crowded = [
      ...Array.from({ length: 120 }, (_, i) => row(`op${i}`, `Other ${i}`, null, 42, "Other Product")),
      row("e42", "Ours", null, 42, "Exponential"),
    ];
    const find = fakeFind(crowded);
    const res = await searchTicketsIdFirst({ query: "E-42", limit: 5, find, productName: (t) => t.product });
    expect(res[0]?.id).toBe("e42");
  });

  it("stops paging on a short page, and never pages past the cap", async () => {
    const few = [row("a", "A", null, 7, "Other Product"), row("b", "B", null, 7, "Other Product")];
    const findFew = fakeFind(few);
    await searchTicketsIdFirst({ query: "E-7", limit: 5, find: findFew, productName: (t) => t.product });
    // One id page (short, so it stops) plus the text query.
    expect(findFew).toHaveBeenCalledTimes(2);

    const many = Array.from({ length: 5000 }, (_, i) => row(`m${i}`, `M ${i}`, null, 7, "Other Product"));
    const findMany = fakeFind(many);
    await searchTicketsIdFirst({ query: "E-7", limit: 5, find: findMany, productName: (t) => t.product });
    // 20 id pages at most, plus the text query.
    expect(findMany).toHaveBeenCalledTimes(21);
  });

  it("treats a number too big for Ticket.number as text, so the search still answers", async () => {
    const find = fakeFind(rows);
    const res = await searchTicketsIdFirst({ query: "E-2147483648", limit: 5, find, productName: (t) => t.product });
    // No exact-id query ran (it would overflow the Int column); only the text query.
    expect(find).toHaveBeenCalledTimes(1);
    expect(res).toEqual([]);
  });

  it("does not list the named ticket twice", async () => {
    const res = await searchTicketsIdFirst({ query: "snappy.thunder", limit: 20, find: fakeFind(rows) });
    expect(res.filter((t) => t.id === "named")).toHaveLength(1);
  });

  it("still finds tickets by title text, and by partial shortId", async () => {
    const byTitle = await searchTicketsIdFirst({ query: "fun ids", limit: 5, find: fakeFind(rows) });
    expect(byTitle.map((t) => t.id)).toEqual(["named"]);

    const byPartialId = await searchTicketsIdFirst({ query: "thunder.3", limit: 5, find: fakeFind(rows) });
    expect(byPartialId.map((t) => t.id)).toEqual(["t3"]);
  });

  it("skips the exact-id query when the text names no ticket", async () => {
    const find = fakeFind(rows);
    await searchTicketsIdFirst({ query: "fix the search", limit: 5, find });
    expect(find).toHaveBeenCalledTimes(1);
  });
});
