import { describe, expect, it } from "vitest";

import {
  composePromptVersion,
  PROMPT_VERSION,
} from "~/server/services/promptVersion";

describe("composePromptVersion", () => {
  it("appends a well-formed brain version", () => {
    expect(composePromptVersion("brain@9f8e7d6c5b4a")).toBe(
      `${PROMPT_VERSION}+brain@9f8e7d6c5b4a`,
    );
  });

  it("falls back to router-only when absent", () => {
    expect(composePromptVersion(null)).toBe(PROMPT_VERSION);
    expect(composePromptVersion(undefined)).toBe(PROMPT_VERSION);
  });

  it("rejects malformed brain versions", () => {
    expect(composePromptVersion("brain@NOT-HEX")).toBe(PROMPT_VERSION);
    expect(composePromptVersion("v2.1")).toBe(PROMPT_VERSION);
    expect(composePromptVersion("")).toBe(PROMPT_VERSION);
  });
});
