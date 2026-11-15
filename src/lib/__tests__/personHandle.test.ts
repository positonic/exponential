import { describe, it, expect } from "vitest";
import {
  checkHandle,
  couldBeHandle,
  normaliseHandle,
  RESERVED_HANDLES,
} from "~/lib/personHandle";

describe("person handle rules", () => {
  it("stores what was typed trimmed and lowercased", () => {
    expect(normaliseHandle("  James ")).toBe("james");
    expect(checkHandle("  James-F ")).toEqual({ ok: true, handle: "james-f" });
  });

  it("accepts letters, digits and inner hyphens from 3 to 30 characters", () => {
    for (const handle of ["abc", "james", "j4mes", "james-farrell", "007", "a".repeat(30)]) {
      expect(checkHandle(handle)).toEqual({ ok: true, handle });
    }
  });

  it("refuses a handle that is too short or too long", () => {
    for (const handle of ["", "ab", "a".repeat(31)]) {
      expect(checkHandle(handle)).toMatchObject({ ok: false, problem: "length" });
    }
  });

  it("refuses other characters and a hyphen at either end", () => {
    for (const handle of ["james_f", "james.f", "james f", "jámes", "-james", "james-", "a/b", "@james"]) {
      expect(checkHandle(handle)).toMatchObject({ ok: false, problem: "characters" });
    }
  });

  it("refuses every reserved word, however it is cased", () => {
    for (const word of RESERVED_HANDLES) {
      if (word.length < 3) continue; // already refused for length
      expect(checkHandle(word)).toMatchObject({ ok: false, problem: "reserved" });
      expect(checkHandle(word.toUpperCase())).toMatchObject({ ok: false, problem: "reserved" });
    }
    expect(checkHandle("admin")).toMatchObject({ ok: false, problem: "reserved" });
    expect(checkHandle("settings")).toMatchObject({ ok: false, problem: "reserved" });
  });

  it("refuses anything shaped like a generated user id", () => {
    expect(checkHandle("cmwg8yc350011l207pb3hzvea")).toMatchObject({
      ok: false,
      problem: "reserved",
    });
  });

  it("says whether a route segment could be a handle at all", () => {
    expect(couldBeHandle("james")).toBe(true);
    expect(couldBeHandle("James")).toBe(true);
    expect(couldBeHandle("cmwg8yc350011l207pb3hzvea")).toBe(false);
    expect(couldBeHandle("me")).toBe(false);
    expect(couldBeHandle("admin")).toBe(false);
  });
});
