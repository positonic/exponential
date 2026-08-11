import { describe, expect, it } from "vitest";
import {
  SIGN_IN_CODE_ALPHABET,
  SIGN_IN_CODE_LENGTH,
  formatSignInCode,
  generateSignInCode,
  normalizeSignInCode,
} from "../signInCode";

const CROCKFORD = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/;

describe("generateSignInCode", () => {
  it("draws from exactly 32 characters, so `byte % length` stays unbiased", () => {
    // Not a tautology, and not a style rule: the generator maps a uniform byte
    // through a modulo, and 256 is an exact multiple of 32. At any other
    // length the earlier characters come up more often and the code loses
    // entropy - on the one credential ADR-0056 says cannot be rate-limited.
    // Changing the alphabet means adding rejection sampling, not editing this
    // number.
    expect(SIGN_IN_CODE_ALPHABET).toHaveLength(32);
    expect(256 % SIGN_IN_CODE_ALPHABET.length).toBe(0);
  });

  it("returns a code of the declared length", () => {
    expect(generateSignInCode()).toHaveLength(SIGN_IN_CODE_LENGTH);
  });

  it("only ever emits Crockford base32 characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSignInCode()).toMatch(CROCKFORD);
    }
  });

  it("never emits the characters Crockford omits", () => {
    // I, L, O and U are the ones people misread (or that spell things).
    const codes = Array.from({ length: 200 }, () => generateSignInCode()).join("");
    expect(codes).not.toMatch(/[ILOU]/);
  });

  it("does not repeat itself", () => {
    // ~10^12 possibilities, so any collision in 500 draws means the generator
    // is broken rather than unlucky.
    const codes = new Set(Array.from({ length: 500 }, () => generateSignInCode()));
    expect(codes.size).toBe(500);
  });

  it("uses the whole alphabet", () => {
    // Guards against a modulo that silently truncates the character range.
    const seen = new Set(
      Array.from({ length: 2000 }, () => generateSignInCode()).join(""),
    );
    expect(seen.size).toBe(32);
  });
});

describe("formatSignInCode", () => {
  it("splits the code into two readable halves", () => {
    expect(formatSignInCode("ABCD1234")).toBe("ABCD-1234");
  });
});

describe("normalizeSignInCode", () => {
  it("accepts the code exactly as displayed", () => {
    expect(normalizeSignInCode("ABCD-1234")).toBe("ABCD1234");
  });

  it("accepts lower case", () => {
    expect(normalizeSignInCode("abcd-1234")).toBe("ABCD1234");
  });

  it("ignores whitespace people paste in", () => {
    expect(normalizeSignInCode("  ABCD 1234 ")).toBe("ABCD1234");
  });

  it("folds misread letters back onto digits, per Crockford", () => {
    // A generated code never contains I, L or O — so if a user typed one, they
    // misread a 1 or a 0 and we should accept it rather than fail them.
    expect(normalizeSignInCode("IL0O")).toBe("1100");
  });

  it("round-trips a generated code through its displayed form", () => {
    const code = generateSignInCode();
    expect(normalizeSignInCode(formatSignInCode(code))).toBe(code);
  });
});
