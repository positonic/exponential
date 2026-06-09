/**
 * Unit tests for the activity-feed render-hint registry.
 *
 * These guard the *visibility* side of the activity pipeline: a write site can
 * call recordActivity perfectly, but if the (entityType, action) pair has no
 * registry entry it renders as the neutral "touched" fallback instead of a
 * meaningful sentence. This test pins the milestone events we instrument
 * (project/goal completion, weekly review) so they can't silently regress to
 * the fallback.
 *
 * Pure functions, no DB or mocking required.
 */

import { describe, it, expect } from "vitest";
import { resolveFeedHint, describeEntityRef } from "../feedRenderHints";

describe("resolveFeedHint", () => {
  it("renders weekly review completion as a self-contained milestone", () => {
    const hint = resolveFeedHint("weekly_review", "completed");
    expect(hint.iconKind).toBe("milestone");
    expect(hint.template).toBe("{actor} completed their weekly review");
    // Self-contained: must NOT depend on {entityRef} since the event has no
    // entity name (only a completion id).
    expect(hint.template).not.toContain("{entityRef}");
  });

  it("renders project creation and completion distinctly", () => {
    const created = resolveFeedHint("project", "created");
    expect(created.iconKind).toBe("created");
    expect(created.template).toBe("{actor} created project {entityRef}");

    const completed = resolveFeedHint("project", "completed");
    expect(completed.iconKind).toBe("milestone");
  });

  it("renders goal completion as a milestone", () => {
    const hint = resolveFeedHint("goal", "completed");
    expect(hint.iconKind).toBe("milestone");
    expect(hint.template).toBe("{actor} completed goal {entityRef}");
  });

  it("falls back to a neutral hint for unknown pairs", () => {
    const hint = resolveFeedHint("nonsense", "nonsense");
    expect(hint.iconKind).toBe("fallback");
    expect(hint.template).toContain("{actor}");
  });
});

describe("describeEntityRef", () => {
  it("prefers name, then title, then a short id slice", () => {
    expect(describeEntityRef("abc", { name: "Launch", title: "T" })).toBe(
      "Launch",
    );
    expect(describeEntityRef("abc", { title: "Q3 Goal" })).toBe("Q3 Goal");
    expect(describeEntityRef("abcdefgh1234", {})).toBe("abcdefgh");
  });
});
