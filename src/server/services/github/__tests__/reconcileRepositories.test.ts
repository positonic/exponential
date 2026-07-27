import { describe, expect, it } from "vitest";
import { reconcileWorkspaceRepositories } from "../reconcileRepositories";

describe("reconcileWorkspaceRepositories", () => {
  it("creates additions not already tracked", () => {
    const result = reconcileWorkspaceRepositories(
      ["o/a"],
      ["o/a", "o/b", "o/c"],
    );
    expect(result.toCreate.sort()).toEqual(["o/b", "o/c"]);
    expect(result.toDelete).toEqual([]);
  });

  it("deletes removals no longer desired", () => {
    const result = reconcileWorkspaceRepositories(
      ["o/a", "o/b", "o/c"],
      ["o/a"],
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toDelete.sort()).toEqual(["o/b", "o/c"]);
  });

  it("is a no-op when current and desired match (no spurious writes)", () => {
    const result = reconcileWorkspaceRepositories(
      ["o/a", "o/b"],
      ["o/b", "o/a"], // same set, different order
    );
    expect(result.toCreate).toEqual([]);
    expect(result.toDelete).toEqual([]);
  });

  it("removes all when desired is empty", () => {
    const result = reconcileWorkspaceRepositories(["o/a", "o/b"], []);
    expect(result.toCreate).toEqual([]);
    expect(result.toDelete.sort()).toEqual(["o/a", "o/b"]);
  });

  it("adds all when current is empty", () => {
    const result = reconcileWorkspaceRepositories([], ["o/a", "o/b"]);
    expect(result.toCreate.sort()).toEqual(["o/a", "o/b"]);
    expect(result.toDelete).toEqual([]);
  });

  it("handles simultaneous add and remove", () => {
    const result = reconcileWorkspaceRepositories(
      ["o/a", "o/b"],
      ["o/b", "o/c"],
    );
    expect(result.toCreate).toEqual(["o/c"]);
    expect(result.toDelete).toEqual(["o/a"]);
  });

  it("returns nothing for two empty sets", () => {
    expect(reconcileWorkspaceRepositories([], [])).toEqual({
      toCreate: [],
      toDelete: [],
    });
  });
});
