/**
 * The `/` block menu's filter.
 *
 * Worth its own test because the rule changed: it used to be a prefix match,
 * which meant you had to know the first word of a block's name to find it —
 * "list" reached nothing, and "div" reached nothing either.
 */

import { describe, expect, it } from "vitest";
import { IconCode, type TablerIcon } from "@tabler/icons-react";
import { filterSlashCommands } from "../slash-command";

const item = (title: string) => ({
  title,
  description: "",
  icon: IconCode as TablerIcon,
  run: () => undefined,
});

const ITEMS = [
  item("Text"),
  item("Heading 1"),
  item("Bullet list"),
  item("Task list"),
  item("Divider"),
  item("Image"),
];

const titles = (query: string) =>
  filterSlashCommands(ITEMS, query).map((i) => i.title);

describe("filterSlashCommands", () => {
  it("returns everything for an empty query", () => {
    expect(titles("")).toHaveLength(ITEMS.length);
    expect(titles("   ")).toHaveLength(ITEMS.length);
  });

  it("matches a prefix", () => {
    expect(titles("div")).toEqual(["Divider"]);
  });

  it("matches mid-title, which a prefix filter could not", () => {
    expect(titles("list")).toEqual(["Bullet list", "Task list"]);
  });

  it("ignores case in both directions", () => {
    expect(titles("IMAGE")).toEqual(["Image"]);
    expect(titles("hEaDiNg")).toEqual(["Heading 1"]);
  });

  it("returns nothing for a query that matches no block", () => {
    // The list renders a "No matches" row rather than unmounting, so an empty
    // result is a state the menu shows, not an error.
    expect(titles("zzz")).toEqual([]);
  });
});
