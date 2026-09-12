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

  it("ranks prefix matches above substring ones", () => {
    // "/task" should land on Task list, not on whichever block merely
    // contains the word — Enter takes the first item.
    expect(titles("task")).toEqual(["Task list"]);
    expect(titles("te")).toEqual(["Text"]);
  });

  it("matches prefixes only for a single character", () => {
    // `/` is live inside prose (the suggestion plugin fires after any space)
    // and Enter runs the selected item, so a stray "/1" mid-sentence must not
    // put "Heading 1" under the Enter key.
    expect(titles("1")).toEqual([]);
    expect(titles("t")).toEqual(["Text", "Task list"]);
  });

  it("returns nothing for a query that matches no block", () => {
    // The list renders a "No matches" row rather than unmounting, so an empty
    // result is a state the menu shows, not an error.
    expect(titles("zzz")).toEqual([]);
  });
});
