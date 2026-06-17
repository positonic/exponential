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

  it("renders a workspace member join with the joiner as actor", () => {
    const hint = resolveFeedHint("workspace_member", "created");
    expect(hint.template).toBe("{actor} joined the workspace");
    // Self-contained: the actor IS the new member, so no {entityRef} needed.
    expect(hint.template).not.toContain("{entityRef}");
  });

  it("renders a closed deal neutrally (no trophy for lost deals)", () => {
    const hint = resolveFeedHint("deal", "completed");
    expect(hint.template).toBe("{actor} closed deal {entityRef}");
    expect(hint.iconKind).toBe("completed");
    expect(hint.iconKind).not.toBe("milestone");
  });

  it("renders a created meeting as a readable sentence with the title", () => {
    const hint = resolveFeedHint("meeting", "created");
    expect(hint.template).toBe("{actor} had a meeting {entityRef}");
    // Must NOT fall back — a missing registry entry would render the neutral
    // "touched" sentence instead, hiding the meeting's title.
    expect(hint.iconKind).toBe("created");
    expect(hint.iconKind).not.toBe("fallback");
    expect(hint.template).toContain("{entityRef}");
    // The same hint drives both the per-workspace feed and the aggregated
    // /activity feed (both call resolveFeedHint), so this one entry covers both.
  });

  it("renders a tracked time entry with the action name and a clock icon", () => {
    const hint = resolveFeedHint("time_entry", "created");
    expect(hint.template).toBe("{actor} tracked time on {entityRef}");
    // Must NOT fall back — a missing registry entry would hide the action name
    // behind the neutral "touched" sentence.
    expect(hint.iconKind).toBe("tracked");
    expect(hint.iconKind).not.toBe("fallback");
    expect(hint.template).toContain("{entityRef}");
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
