import { describe, it, expect } from "vitest";
import { safeSignatureEquals } from "../webhookSignature";

describe("safeSignatureEquals", () => {
  it("matches identical strings", () => {
    expect(safeSignatureEquals("sha256=abcdef", "sha256=abcdef")).toBe(true);
  });

  it("rejects differing strings of equal length", () => {
    expect(safeSignatureEquals("sha256=abcdef", "sha256=abcdeg")).toBe(false);
  });

  it("rejects a shorter string without throwing", () => {
    // crypto.timingSafeEqual throws on length mismatch — the helper must not.
    expect(safeSignatureEquals("sha256=a", "sha256=abcdef")).toBe(false);
  });

  it("rejects a longer string without throwing", () => {
    expect(safeSignatureEquals("sha256=abcdefabcdef", "sha256=abcdef")).toBe(false);
  });

  it("rejects the empty string against a non-empty expected value", () => {
    expect(safeSignatureEquals("", "sha256=abcdef")).toBe(false);
  });
});
