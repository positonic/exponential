import { describe, it, expect } from "vitest";
import { dependencyProgress, sortOpenFirst } from "../dependencyOrdering";
import type { TicketStatus } from "~/lib/ticket-statuses";

const t = (id: string, status: TicketStatus) => ({ id, status });

describe("sortOpenFirst", () => {
  it("moves completed tickets to the end and keeps link order within each half", () => {
    const input = [
      t("a", "DONE"),
      t("b", "BACKLOG"),
      t("c", "DEPLOYED"),
      t("d", "IN_PROGRESS"),
      t("e", "ARCHIVED"),
      t("f", "QA"),
    ];
    expect(sortOpenFirst(input).map((x) => x.id)).toEqual(["b", "d", "f", "a", "c", "e"]);
  });

  it("does not rank open tickets by status", () => {
    const input = [t("a", "QA"), t("b", "BACKLOG"), t("c", "IN_PROGRESS")];
    expect(sortOpenFirst(input).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = [t("a", "DONE"), t("b", "BACKLOG")];
    const out = sortOpenFirst(input);
    expect(out).not.toBe(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("dependencyProgress", () => {
  it("is null with nothing to count", () => {
    expect(dependencyProgress([])).toBeNull();
  });

  it("counts DONE, DEPLOYED and ARCHIVED as done", () => {
    expect(
      dependencyProgress([
        t("a", "DONE"),
        t("b", "DEPLOYED"),
        t("c", "ARCHIVED"),
        t("d", "BLOCKED"),
        t("e", "BACKLOG"),
      ]),
    ).toBe("3/5 done");
  });

  it("reads 0/n when nothing is finished", () => {
    expect(dependencyProgress([t("a", "BACKLOG"), t("b", "IN_PROGRESS")])).toBe("0/2 done");
  });
});
