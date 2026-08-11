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

  it("renders objective completion as a milestone with glossary copy", () => {
    const hint = resolveFeedHint("goal", "completed");
    expect(hint.iconKind).toBe("milestone");
    // Glossary: rendered copy says "objective", never the stored "goal".
    expect(hint.template).toBe("{actor} completed objective {entityRef}");
  });

  it("renders objective create/status/delete with glossary copy and namesake icons", () => {
    const created = resolveFeedHint("goal", "created");
    expect(created.template).toBe("{actor} created objective {entityRef}");
    expect(created.iconKind).toBe("created");

    const statusChanged = resolveFeedHint("goal", "status_changed");
    expect(statusChanged.template).toBe(
      "{actor} changed status on objective {entityRef}",
    );
    expect(statusChanged.iconKind).toBe("status_changed");

    const deleted = resolveFeedHint("goal", "deleted");
    expect(deleted.template).toBe("{actor} deleted objective {entityRef}");
    expect(deleted.iconKind).toBe("deleted");
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

  it("renders KR create/delete with glossary copy and namesake icons", () => {
    const created = resolveFeedHint("key_result", "created");
    expect(created.template).toBe("{actor} created key result {entityRef}");
    expect(created.iconKind).toBe("created");

    const deleted = resolveFeedHint("key_result", "deleted");
    expect(deleted.template).toBe("{actor} deleted key result {entityRef}");
    expect(deleted.iconKind).toBe("deleted");

    const statusChanged = resolveFeedHint("key_result", "status_changed");
    expect(statusChanged.template).toBe(
      "{actor} changed status on key result {entityRef}",
    );
    expect(statusChanged.iconKind).toBe("status_changed");
  });

  it("renders a KR check-in with glossary copy and the tracked icon", () => {
    const hint = resolveFeedHint("key_result", "checked_in");
    expect(hint.template).toBe("{actor} checked in on key result {entityRef}");
    // Glossary: rendered copy says "key result", never the stored entityType.
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
