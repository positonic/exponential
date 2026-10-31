/**
 * The property-type registry (ADR-0078 §5): every scalar type accepts what it
 * should, rejects the rest in plain words, and reads back as Markdown.
 */
import { describe, expect, it } from "vitest";

import { cellMarkdown, findOption, validateValue } from "../properties";
import {
  ADDABLE_PROPERTY_TYPES,
  findProperty,
  normaliseOptions,
  type PropertyDef,
} from "../schema";

const def = (type: PropertyDef["type"], extra: Partial<PropertyDef> = {}): PropertyDef => ({
  id: `p_${type}`,
  name: type,
  type,
  ...extra,
});

const status = def("select", {
  name: "Status",
  options: [
    { id: "o_nm", name: "Not measured", color: "gray" },
    { id: "o_tr", name: "Tracked", color: "green" },
  ],
});
const tags = def("multiSelect", {
  options: [
    { id: "o_a", name: "Alpha", color: "blue" },
    { id: "o_b", name: "Beta", color: "teal" },
  ],
});

describe("validateValue", () => {
  it("clears a cell on null, undefined or an empty string, whatever the type", () => {
    for (const type of ["text", "number", "select", "date", "checkbox", "url", "person"] as const) {
      expect(validateValue(def(type), null)).toEqual({ ok: true, value: null });
      expect(validateValue(def(type), "")).toEqual({ ok: true, value: null });
      expect(validateValue(def(type), undefined)).toEqual({ ok: true, value: null });
    }
  });

  it("title and text take strings only", () => {
    expect(validateValue(def("text"), "p95 latency")).toEqual({ ok: true, value: "p95 latency" });
    expect(validateValue(def("title"), 42)).toEqual({ ok: false, reason: "expects text, got a number" });
    expect(validateValue(def("text"), ["a"])).toMatchObject({ ok: false, reason: "expects text, got a list" });
  });

  it("number takes finite numbers and numeric strings", () => {
    expect(validateValue(def("number"), 3.5)).toEqual({ ok: true, value: 3.5 });
    expect(validateValue(def("number"), " 42 ")).toEqual({ ok: true, value: 42 });
    expect(validateValue(def("number"), "forty")).toMatchObject({ ok: false, reason: 'expects a number, got "forty"' });
    expect(validateValue(def("number"), Number.NaN)).toMatchObject({ ok: false });
    expect(validateValue(def("number"), true)).toMatchObject({ ok: false, reason: "expects a number, got a boolean" });
  });

  it("select stores the option id, resolving by id or by name, and lists the options on a miss", () => {
    expect(validateValue(status, "Tracked")).toEqual({ ok: true, value: "o_tr" });
    expect(validateValue(status, "tracked")).toEqual({ ok: true, value: "o_tr" });
    expect(validateValue(status, "o_nm")).toEqual({ ok: true, value: "o_nm" });
    expect(validateValue(status, "Done")).toEqual({
      ok: false,
      reason: 'has no option "Done"; expects one of: Not measured, Tracked',
    });
    expect(validateValue(status, 1)).toMatchObject({ ok: false, reason: "expects an option name, got a number" });
  });

  it("multiSelect takes a list or a comma-separated string, de-duplicated", () => {
    expect(validateValue(tags, ["Alpha", "o_b", "alpha"])).toEqual({ ok: true, value: ["o_a", "o_b"] });
    expect(validateValue(tags, "Beta, Alpha")).toEqual({ ok: true, value: ["o_b", "o_a"] });
    expect(validateValue(tags, ["Alpha", "Gamma"])).toEqual({
      ok: false,
      reason: 'has no option "Gamma"; expects any of: Alpha, Beta',
    });
    expect(validateValue(tags, [1])).toMatchObject({ ok: false });
  });

  it("date keeps a bare day and normalises an instant to UTC", () => {
    expect(validateValue(def("date"), "2026-10-31")).toEqual({ ok: true, value: "2026-10-31" });
    expect(validateValue(def("date"), "2026-10-31T10:00:00+02:00")).toEqual({
      ok: true,
      value: "2026-10-31T08:00:00.000Z",
    });
    expect(validateValue(def("date"), new Date("2026-01-02T03:04:05Z"))).toEqual({
      ok: true,
      value: "2026-01-02T03:04:05.000Z",
    });
    expect(validateValue(def("date"), "next tuesday")).toMatchObject({ ok: false, reason: 'expects an ISO date, got "next tuesday"' });
    expect(validateValue(def("date"), 1700000000)).toMatchObject({ ok: false });
  });

  it("checkbox takes booleans and the usual words", () => {
    expect(validateValue(def("checkbox"), true)).toEqual({ ok: true, value: true });
    expect(validateValue(def("checkbox"), "Yes")).toEqual({ ok: true, value: true });
    expect(validateValue(def("checkbox"), "0")).toEqual({ ok: true, value: false });
    expect(validateValue(def("checkbox"), "maybe")).toMatchObject({ ok: false, reason: 'expects true or false, got "maybe"' });
    expect(validateValue(def("checkbox"), 1)).toMatchObject({ ok: false });
  });

  it("url takes http, https and mailto only", () => {
    expect(validateValue(def("url"), " https://example.com/x?y=1 ")).toEqual({ ok: true, value: "https://example.com/x?y=1" });
    expect(validateValue(def("url"), "mailto:ana@example.com")).toMatchObject({ ok: true });
    expect(validateValue(def("url"), "javascript:alert(1)")).toMatchObject({ ok: false, reason: expect.stringContaining("http, https or mailto") as string });
    expect(validateValue(def("url"), "not a url")).toMatchObject({ ok: false, reason: 'expects a URL, got "not a url"' });
  });

  it("person normalises to a list of user ids", () => {
    expect(validateValue(def("person"), "user-1")).toEqual({ ok: true, value: ["user-1"] });
    expect(validateValue(def("person"), ["user-1", "user-2", "user-1"])).toEqual({ ok: true, value: ["user-1", "user-2"] });
    expect(validateValue(def("person"), 7)).toMatchObject({ ok: false });
  });

  it("relation and the read-only types take no cell value", () => {
    expect(validateValue(def("relation"), "row-1")).toMatchObject({ ok: false, reason: expect.stringContaining("relation") as string });
    expect(validateValue(def("relation"), null)).toMatchObject({ ok: false });
    expect(validateValue(def("createdTime"), "2026-10-31")).toEqual({ ok: false, reason: "is read-only (createdTime)" });
    expect(validateValue(def("createdBy"), null)).toMatchObject({ ok: false });
  });
});

describe("cellMarkdown", () => {
  it("renders each type for the projected table", () => {
    expect(cellMarkdown(def("text"), "a | b\nc")).toBe("a \\| b c");
    expect(cellMarkdown(def("number"), 12.5)).toBe("12.5");
    expect(cellMarkdown(status, "o_tr")).toBe("Tracked");
    expect(cellMarkdown(status, "o_gone")).toBe("o_gone");
    expect(cellMarkdown(tags, ["o_b", "o_a"])).toBe("Beta, Alpha");
    expect(cellMarkdown(def("date"), "2026-10-31")).toBe("2026-10-31");
    expect(cellMarkdown(def("checkbox"), true)).toBe("Yes");
    expect(cellMarkdown(def("checkbox"), false)).toBe("No");
    expect(cellMarkdown(def("url"), "https://x.y")).toBe("https://x.y");
    expect(
      cellMarkdown(def("person"), ["u1", "u2"], { personName: (id) => (id === "u1" ? "Ana" : undefined) }),
    ).toBe("Ana, u2");
  });

  it("an empty value is an empty cell", () => {
    expect(cellMarkdown(def("text"), null)).toBe("");
    expect(cellMarkdown(def("person"), [])).toBe("");
    expect(cellMarkdown(def("checkbox"), undefined)).toBe("");
  });
});

describe("schema helpers", () => {
  it("findProperty resolves ids first, then a unique case-insensitive name", () => {
    const props: PropertyDef[] = [def("text", { id: "a", name: "Owner" }), def("text", { id: "b", name: "owner" }), def("text", { id: "c", name: "Notes" })];
    expect(findProperty(props, "a")?.id).toBe("a");
    expect(findProperty(props, " notes ")?.id).toBe("c");
    expect(findProperty(props, "owner")).toBeUndefined();
  });

  it("findOption resolves ids first, then names", () => {
    expect(findOption(status, "o_nm")?.name).toBe("Not measured");
    expect(findOption(status, "TRACKED")?.id).toBe("o_tr");
    expect(findOption(def("text"), "x")).toBeUndefined();
  });

  it("normaliseOptions mints ids and colours, keeps existing ids, and refuses duplicate names", () => {
    const first = normaliseOptions([{ name: "Open" }, { name: "Done", color: "green" }]);
    expect(first.options.map((o) => o.name)).toEqual(["Open", "Done"]);
    expect(first.options[0]!.id).toHaveLength(12);
    expect(first.options[0]!.color).toBe("gray");
    expect(first.options[1]!.color).toBe("green");

    const renamed = normaliseOptions(
      [{ id: first.options[0]!.id, name: "Opened" }, { name: "Blocked" }],
      first.options,
    );
    expect(renamed.options[0]).toMatchObject({ id: first.options[0]!.id, name: "Opened", color: "gray" });
    expect(renamed.options[1]!.id).not.toBe(first.options[1]!.id);

    expect(normaliseOptions([{ name: "A" }, { name: " a " }])).toEqual({ options: [], duplicateName: "a" });
  });

  it("title and relation are not addable types", () => {
    expect(ADDABLE_PROPERTY_TYPES).not.toContain("title");
    expect(ADDABLE_PROPERTY_TYPES).not.toContain("relation");
    expect(ADDABLE_PROPERTY_TYPES).toContain("select");
    expect(ADDABLE_PROPERTY_TYPES).toContain("createdBy");
  });
});
