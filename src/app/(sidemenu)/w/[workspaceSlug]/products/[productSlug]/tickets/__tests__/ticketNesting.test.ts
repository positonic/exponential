import { describe, it, expect } from "vitest";
import {
  nestTicketsByDependency,
  MAX_NESTING_DEPTH,
  type NestableTicket,
} from "../ticketNesting";

function t(id: string, dependsOnIds: string[] = []): NestableTicket {
  return { id, dependsOnIds };
}

/** "id@depth" per row, in order. */
const shape = (rows: Array<{ ticket: { id: string }; depth: number }>) =>
  rows.map((r) => `${r.ticket.id}@${r.depth}`);

describe("nestTicketsByDependency", () => {
  it("keeps a dependency-free list flat and in order", () => {
    const rows = nestTicketsByDependency([t("a"), t("b"), t("c")]);
    expect(shape(rows)).toEqual(["a@0", "b@0", "c@0"]);
    expect(rows.every((r) => r.childCount === 0)).toBe(true);
  });

  it("nests what a ticket depends on beneath it", () => {
    // c depends on b, b depends on a: c is the top of the chain.
    const rows = nestTicketsByDependency([t("a"), t("b", ["a"]), t("c", ["b"])]);
    expect(shape(rows)).toEqual(["c@0", "b@1", "a@2"]);
    expect(rows[0]!.childCount).toBe(1);
    expect(rows[2]!.childCount).toBe(0);
  });

  it("orders roots and siblings by the input order", () => {
    const rows = nestTicketsByDependency([
      t("z", ["m", "k"]),
      t("k"),
      t("m"),
      t("a"),
    ]);
    // k is listed before m, so it comes first under z.
    expect(shape(rows)).toEqual(["z@0", "k@1", "m@1", "a@0"]);
  });

  it("shows a shared dependency under each ticket that depends on it", () => {
    const rows = nestTicketsByDependency([t("shared"), t("p1", ["shared"]), t("p2", ["shared"])]);
    expect(shape(rows)).toEqual(["p1@0", "shared@1", "p2@0", "shared@1"]);
    expect(rows.map((r) => r.rowKey)).toEqual(["p1", "p1/shared", "p2", "p2/shared"]);
  });

  it("treats a ticket whose parent is not in the list as a root", () => {
    // "b" depends on "a", but "a" was filtered out of this list.
    const rows = nestTicketsByDependency([t("b", ["a"]), t("c")]);
    expect(shape(rows)).toEqual(["b@0", "c@0"]);
    expect(rows[0]!.childCount).toBe(0);
  });

  it("hides the children of a collapsed ticket but still counts them", () => {
    const rows = nestTicketsByDependency(
      [t("a"), t("b", ["a"]), t("c", ["b"])],
      new Set(["b"]),
    );
    expect(shape(rows)).toEqual(["c@0", "b@1"]);
    expect(rows[1]).toMatchObject({ childCount: 1, isCollapsed: true });
  });

  it("does not promote the hidden children of a collapsed root to roots", () => {
    const rows = nestTicketsByDependency(
      [t("a"), t("b", ["a"])],
      new Set(["b"]),
    );
    expect(shape(rows)).toEqual(["b@0"]);
  });

  it("survives a dependency cycle without repeating or dropping tickets", () => {
    // a <-> b, and c depends on a.
    const rows = nestTicketsByDependency([t("a", ["b"]), t("b", ["a"]), t("c", ["a"])]);
    expect(shape(rows)).toEqual(["c@0", "a@1", "b@2"]);
  });

  it("promotes one member of a pure cycle so it still renders", () => {
    const rows = nestTicketsByDependency([t("a", ["b"]), t("b", ["a"])]);
    expect(shape(rows)).toEqual(["a@0", "b@1"]);
  });

  it("ignores self-dependencies and duplicate edges", () => {
    const rows = nestTicketsByDependency([t("a", ["a", "b", "b"]), t("b")]);
    expect(shape(rows)).toEqual(["a@0", "b@1"]);
    expect(rows[0]!.childCount).toBe(1);
  });

  it("stops descending past MAX_NESTING_DEPTH", () => {
    const n = MAX_NESTING_DEPTH + 3;
    const chain: NestableTicket[] = [];
    for (let i = 0; i < n; i++) chain.push(t(`t${i}`, i > 0 ? [`t${i - 1}`] : []));
    const rows = nestTicketsByDependency(chain);
    expect(rows).toHaveLength(MAX_NESTING_DEPTH + 1);
    expect(rows.at(-1)!.depth).toBe(MAX_NESTING_DEPTH);
  });
});
