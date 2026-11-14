/**
 * The `/` block menu's filter. It used to be a prefix match, so you had to
 * know the first word of a block's name to find it: "list" reached neither
 * list, and "div" reached nothing.
 */

import { describe, expect, it } from "vitest";
import { IconCode, type TablerIcon } from "@tabler/icons-react";
import { filterSlashCommands, type SlashCommandItem } from "../slash-command";

const item = (title: string): SlashCommandItem => ({
  title,
  description: "",
  icon: IconCode as TablerIcon,
  run: () => undefined,
});

// The real built-in titles plus the Pages host's extras, in menu order.
const ITEMS = [
  "Text",
  "Heading 1",
  "Heading 2",
  "Heading 3",
  "Bullet list",
  "Numbered list",
  "Task list",
  "Code block",
  "Diagram",
  "Quote",
  "Divider",
  "Table",
  "YouTube",
  "Image",
  "Page",
  "Database",
].map(item);

const titles = (query: string) =>
  filterSlashCommands(ITEMS, query).map((i) => i.title);

describe("filterSlashCommands", () => {
  it("returns everything, in order, for an empty or blank query", () => {
    expect(titles("")).toEqual(ITEMS.map((i) => i.title));
    expect(titles("   ")).toHaveLength(ITEMS.length);
  });

  it("matches a prefix", () => {
    expect(titles("div")).toEqual(["Divider"]);
    expect(titles("ima")).toEqual(["Image"]);
  });

  it("matches mid-title, which a prefix filter could not", () => {
    expect(titles("list")).toEqual(["Bullet list", "Numbered list", "Task list"]);
    expect(titles("block")).toEqual(["Code block"]);
    expect(titles("tube")).toEqual(["YouTube"]);
  });

  it("ignores case in both directions", () => {
    expect(titles("IMAGE")).toEqual(["Image"]);
    expect(titles("hEaDiNg 2")).toEqual(["Heading 2"]);
    expect(titles("LIST")).toEqual(["Bullet list", "Numbered list", "Task list"]);
  });

  it("ranks prefix matches above substring ones", () => {
    // Enter takes the first item, so "/ta" must land on a block that starts
    // with it, ahead of one that merely contains it ("Database").
    expect(titles("ta")).toEqual(["Task list", "Table", "Database"]);
    expect(titles("te")).toEqual(["Text", "Quote"]);
  });

  it("matches prefixes only for a single character", () => {
    // `/` is live inside prose and Enter runs the selected item, so a stray
    // "/1" mid-sentence must not put "Heading 1" under the Enter key.
    expect(titles("1")).toEqual([]);
    expect(titles("t")).toEqual(["Text", "Task list", "Table"]);
  });

  it("returns nothing for a query that matches no block", () => {
    // The list renders a "No matches" row rather than unmounting.
    expect(titles("zzz")).toEqual([]);
    expect(titles("listzzz")).toEqual([]);
  });
});
