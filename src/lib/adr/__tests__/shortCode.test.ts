import { describe, expect, it } from "vitest";
import { suggestShortCode } from "../shortCode";

describe("suggestShortCode", () => {
  it("uses the last (most distinctive) word of the repo name", () => {
    expect(suggestShortCode("clear-api")).toBe("API");
    expect(suggestShortCode("clear-context-pipeline")).toBe("PIPE");
  });

  it("truncates a single-word name to four letters", () => {
    expect(suggestShortCode("exponential")).toBe("EXPO");
  });

  it("de-conflicts by extending with the word's own letters", () => {
    const taken = new Set(["PIPE"]);
    expect(suggestShortCode("clear-context-pipeline", taken)).toBe("PIPEL");
  });

  it("falls back to numeric suffixes when letters run out", () => {
    const taken = new Set(["API"]);
    expect(suggestShortCode("clear-api", taken)).toBe("API2");
  });

  it("never starts with a digit", () => {
    expect(/^[A-Z]/.test(suggestShortCode("2fa-service"))).toBe(true);
  });
});
