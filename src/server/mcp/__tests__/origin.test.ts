import { describe, it, expect } from "vitest";

import { parseAllowedOrigins } from "../origin";

describe("parseAllowedOrigins", () => {
  it("is empty when unset or blank", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("  , ")).toEqual([]);
  });

  it("trims entries and normalises each to its origin", () => {
    expect(parseAllowedOrigins(" https://a.example.test/ ,https://b.example.test:8443/path")).toEqual([
      "https://a.example.test",
      "https://b.example.test:8443",
    ]);
  });

  it("drops entries that are not URLs", () => {
    expect(parseAllowedOrigins("inspector, https://ok.example.test")).toEqual(["https://ok.example.test"]);
  });
});
