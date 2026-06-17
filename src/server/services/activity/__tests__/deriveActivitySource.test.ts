import { describe, it, expect } from "vitest";

import {
  deriveActivitySource,
  CHANNEL_SOURCE_FALLBACK,
} from "../deriveActivitySource";

describe("deriveActivitySource", () => {
  it("returns the provider for a channel_summary event", () => {
    expect(
      deriveActivitySource({
        entityType: "channel_summary",
        metadata: { provider: "whatsapp" },
      }),
    ).toBe("whatsapp");
  });

  it("returns a different provider verbatim (forward-compatible)", () => {
    expect(
      deriveActivitySource({
        entityType: "channel_summary",
        metadata: { provider: "slack" },
      }),
    ).toBe("slack");
  });

  it("falls back to the channel source when a summary has no provider", () => {
    expect(
      deriveActivitySource({ entityType: "channel_summary", metadata: {} }),
    ).toBe(CHANNEL_SOURCE_FALLBACK);
    expect(
      deriveActivitySource({ entityType: "channel_summary", metadata: null }),
    ).toBe(CHANNEL_SOURCE_FALLBACK);
  });

  it("returns github for GitHub-origin rows", () => {
    expect(deriveActivitySource({ entityType: "github_commit" })).toBe("github");
    expect(deriveActivitySource({ entityType: "github" })).toBe("github");
  });

  it("returns internal for everything else", () => {
    for (const entityType of [
      "action",
      "ticket",
      "project",
      "goal",
      "meeting",
      "time_entry",
    ]) {
      expect(deriveActivitySource({ entityType })).toBe("internal");
    }
  });

  it("ignores a non-object metadata for non-channel rows", () => {
    expect(
      deriveActivitySource({ entityType: "action", metadata: "whatsapp" }),
    ).toBe("internal");
  });
});
