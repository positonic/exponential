import { describe, it, expect } from "vitest";
import { parseDrawerParam } from "../useOkrSearchParams";

describe("parseDrawerParam", () => {
  it("returns null for missing param", () => {
    expect(parseDrawerParam(null)).toBeNull();
    expect(parseDrawerParam("")).toBeNull();
  });

  it("parses an objective deep-link", () => {
    expect(parseDrawerParam("objective:42")).toEqual({
      type: "objective",
      id: "42",
    });
  });

  it("parses a key result deep-link with a cuid id", () => {
    expect(parseDrawerParam("keyResult:cml123abc")).toEqual({
      type: "keyResult",
      id: "cml123abc",
    });
  });

  it("preserves colons inside the id", () => {
    expect(parseDrawerParam("keyResult:a:b")).toEqual({
      type: "keyResult",
      id: "a:b",
    });
  });

  it("returns null for an unknown entity type", () => {
    expect(parseDrawerParam("project:1")).toBeNull();
    expect(parseDrawerParam("objective")).toBeNull();
  });

  it("returns null when the id is empty", () => {
    expect(parseDrawerParam("objective:")).toBeNull();
  });

  it("returns null when there is no separator", () => {
    expect(parseDrawerParam("objective42")).toBeNull();
  });
});
