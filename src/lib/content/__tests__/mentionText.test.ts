import { describe, it, expect } from "vitest";
import { collapseMentions, expandMentions } from "../mentionText";

const CANDIDATES = [
  { id: "u1", name: "James Farrell" },
  { id: "u2", name: "James" },
  { id: "u3", name: "Andi Stanner" },
];

describe("collapseMentions", () => {
  it("collapses known-name markup to display text", () => {
    expect(
      collapseMentions("hi @[James Farrell](u1), ping @[Andi Stanner](u3)", CANDIDATES),
    ).toBe("hi @James Farrell, ping @Andi Stanner");
  });

  it("leaves unknown-name markup untouched so it survives an edit round-trip", () => {
    expect(collapseMentions("cc @[Departed User](u9)", CANDIDATES)).toBe(
      "cc @[Departed User](u9)",
    );
  });

  it("matches names case-insensitively", () => {
    expect(collapseMentions("@[james farrell](u1)", CANDIDATES)).toBe(
      "@james farrell",
    );
  });

  it("is a no-op with no candidates or empty text", () => {
    expect(collapseMentions("@[James](u2)", [])).toBe("@[James](u2)");
    expect(collapseMentions("", CANDIDATES)).toBe("");
  });
});

describe("expandMentions", () => {
  it("expands display text to markup", () => {
    expect(expandMentions("hi @James Farrell thats it", CANDIDATES)).toBe(
      "hi @[James Farrell](u1) thats it",
    );
  });

  it("prefers the longest matching name", () => {
    expect(expandMentions("@James Farrell and @James", CANDIDATES)).toBe(
      "@[James Farrell](u1) and @[James](u2)",
    );
  });

  it("matches case-insensitively but emits the canonical name", () => {
    expect(expandMentions("hey @james farrell", CANDIDATES)).toBe(
      "hey @[James Farrell](u1)",
    );
  });

  it("expands at the start of the text and before punctuation", () => {
    expect(expandMentions("@James: hello", CANDIDATES)).toBe(
      "@[James](u2): hello",
    );
    expect(expandMentions("thanks @James!", CANDIDATES)).toBe(
      "thanks @[James](u2)!",
    );
  });

  it("does not expand partial-word matches or mid-word @", () => {
    expect(expandMentions("@Jameson", CANDIDATES)).toBe("@Jameson");
    expect(expandMentions("mail me at farrell@James.com", CANDIDATES)).toBe(
      "mail me at farrell@James.com",
    );
  });

  it("leaves existing markup untouched", () => {
    expect(
      expandMentions("@[James Farrell](u1) meet @Andi Stanner", CANDIDATES),
    ).toBe("@[James Farrell](u1) meet @[Andi Stanner](u3)");
  });

  it("round-trips through collapse", () => {
    const stored = "ping @[James Farrell](u1) about @[Andi Stanner](u3)";
    const display = collapseMentions(stored, CANDIDATES);
    expect(expandMentions(display, CANDIDATES)).toBe(stored);
  });

  it("is a no-op with no candidates", () => {
    expect(expandMentions("hi @James", [])).toBe("hi @James");
  });
});
