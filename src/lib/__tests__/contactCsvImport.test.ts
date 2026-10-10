import { describe, expect, it } from "vitest";

import {
  buildContactRow,
  looksLikeEmail,
  parseCsv,
  parseDateCell,
  parseMoney,
  parseTags,
  splitFullName,
  suggestTarget,
  type CsvColumnMapping,
} from "~/lib/contactCsvImport";

describe("parseCsv", () => {
  it("parses a simple header + rows", () => {
    const { headers, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas, newlines and escaped quotes", () => {
    const { rows } = parseCsv(
      'name,notes\n"Stuart, Lynda","line one\nline ""two"""\n',
    );
    expect(rows).toEqual([["Stuart, Lynda", 'line one\nline "two"']]);
  });

  it("handles CRLF line endings and a UTF-8 BOM", () => {
    const { headers, rows } = parseCsv("\uFEFFa,b\r\n1,2\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"]]);
  });

  it("skips blank lines and normalizes ragged rows to header width", () => {
    const { rows } = parseCsv("a,b,c\n\n1,2\n1,2,3,4\n");
    expect(rows).toEqual([
      ["1", "2", ""],
      ["1", "2", "3"],
    ]);
  });

  it("throws on empty input and unterminated quotes", () => {
    expect(() => parseCsv("")).toThrow(/empty/i);
    expect(() => parseCsv("a,b\n\"unterminated")).toThrow(/unterminated/i);
  });
});

describe("suggestTarget", () => {
  it("maps known headers", () => {
    expect(suggestTarget("name")).toBe("fullName");
    expect(suggestTarget("first_name")).toBe("firstName");
    expect(suggestTarget("Last Name")).toBe("lastName");
    expect(suggestTarget("email")).toBe("email");
    expect(suggestTarget("tags")).toBe("tags");
    expect(suggestTarget("first_seen")).toBe("firstSeenAt");
    expect(suggestTarget("revenue")).toBe("dealValue");
  });

  it("defaults unknown headers to metadata", () => {
    expect(suggestTarget("user_id")).toBe("metadata");
    expect(suggestTarget("membership_status")).toBe("metadata");
    expect(suggestTarget("event_checked_in_count")).toBe("metadata");
  });
});

describe("parseMoney", () => {
  it("parses common currency formats", () => {
    expect(parseMoney("US$400.00")).toEqual({ value: 400, currency: "USD" });
    expect(parseMoney("$1,234.56")).toEqual({ value: 1234.56, currency: "USD" });
    expect(parseMoney("€50")).toEqual({ value: 50, currency: "EUR" });
    expect(parseMoney("£120.50")).toEqual({ value: 120.5, currency: "GBP" });
    expect(parseMoney("EUR 99")).toEqual({ value: 99, currency: "EUR" });
  });

  it("returns null for blanks and non-numbers", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("n/a")).toBeNull();
  });
});

describe("small helpers", () => {
  it("parseTags splits, trims and dedupes", () => {
    expect(parseTags("vip, member; vip ,")).toEqual(["vip", "member"]);
  });

  it("splitFullName splits at the first space", () => {
    expect(splitFullName("Lynda Stuart")).toEqual({
      firstName: "Lynda",
      lastName: "Stuart",
    });
    expect(splitFullName("Ana Maria da Silva")).toEqual({
      firstName: "Ana",
      lastName: "Maria da Silva",
    });
    expect(splitFullName("Cher")).toEqual({ firstName: "Cher", lastName: null });
  });

  it("looksLikeEmail accepts addresses and rejects junk", () => {
    expect(looksLikeEmail("a@b.co")).toBe(true);
    expect(looksLikeEmail("not-an-email")).toBe(false);
  });

  it("parseDateCell parses ISO dates and rejects junk", () => {
    expect(parseDateCell("2026-08-23T05:09:44.546Z")?.toISOString()).toBe(
      "2026-08-23T05:09:44.546Z",
    );
    expect(parseDateCell("whenever")).toBeNull();
  });
});

describe("buildContactRow", () => {
  const headers = [
    "name",
    "first_name",
    "last_name",
    "email",
    "first_seen",
    "user_id",
    "tags",
    "revenue",
    "membership_name",
  ];
  const mapping: CsvColumnMapping = {
    name: "fullName",
    first_name: "firstName",
    last_name: "lastName",
    email: "email",
    first_seen: "firstSeenAt",
    user_id: "metadata",
    tags: "tags",
    revenue: "dealValue",
    membership_name: "metadata",
  };

  it("interprets a full row through the mapping", () => {
    const row = buildContactRow(
      headers,
      [
        "Lynda Stuart",
        "Lynda",
        "Stuart",
        "lyndas@example.org",
        "2026-08-23T05:09:44.546Z",
        "usr-h1fguWi7eGGbpMP",
        "vip,speaker",
        "US$400.00",
        "Gold",
      ],
      mapping,
    );
    expect(row.firstName).toBe("Lynda");
    expect(row.lastName).toBe("Stuart");
    expect(row.email).toBe("lyndas@example.org");
    expect(row.firstSeenAt?.toISOString()).toBe("2026-08-23T05:09:44.546Z");
    expect(row.tags).toEqual(["vip", "speaker"]);
    expect(row.deal).toEqual({ value: 400, currency: "USD" });
    expect(row.metadata).toEqual({
      user_id: "usr-h1fguWi7eGGbpMP",
      membership_name: "Gold",
    });
  });

  it("falls back to splitting fullName when first/last cells are empty", () => {
    const row = buildContactRow(
      headers,
      ["Sandeep Patel", "", "", "sandeep@example.com", "", "", "", "", ""],
      mapping,
    );
    expect(row.firstName).toBe("Sandeep");
    expect(row.lastName).toBe("Patel");
    expect(row.deal).toBeNull();
    expect(row.metadata).toEqual({});
  });

  it("nulls the email when the cell is not an email", () => {
    const row = buildContactRow(
      headers,
      ["X", "", "", "not-an-email", "", "", "", "", ""],
      mapping,
    );
    expect(row.email).toBeNull();
  });
});
