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

  it("renders feature events without falling back", () => {
    // These pairs are emitted by the product plugin's feature router; a
    // missing entry would render the neutral "touched" sentence and hide the
    // feature name behind a fallback icon.
    const created = resolveFeedHint("feature", "created");
    expect(created.template).toBe("{actor} created feature {entityRef}");
    expect(created.iconKind).toBe("created");

    const updated = resolveFeedHint("feature", "updated");
    expect(updated.template).toBe("{actor} updated feature {entityRef}");
    expect(updated.iconKind).toBe("updated");

    const statusChanged = resolveFeedHint("feature", "status_changed");
    expect(statusChanged.template).toBe(
      "{actor} changed status on feature {entityRef}",
    );
    expect(statusChanged.iconKind).toBe("status_changed");
  });

  it("renders feature scope events without falling back", () => {
    // metadata.name carries "<feature name> <version>" so {entityRef} reads
    // naturally (e.g. "added scope Onboarding V1").
    const created = resolveFeedHint("feature_scope", "created");
    expect(created.template).toBe("{actor} added scope {entityRef}");
    expect(created.iconKind).toBe("created");

    const updated = resolveFeedHint("feature_scope", "updated");
    expect(updated.template).toBe("{actor} updated scope {entityRef}");
    expect(updated.iconKind).toBe("updated");

    const statusChanged = resolveFeedHint("feature_scope", "status_changed");
    expect(statusChanged.template).toBe(
      "{actor} changed status on scope {entityRef}",
    );
    expect(statusChanged.iconKind).toBe("status_changed");
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

  it("resolves a feature event's name from metadata, not the CUID", () => {
    // feature.create passes { name } — the feed must show the feature name,
    // not the first 8 chars of the entity id.
    expect(
      describeEntityRef("cmlf3zmw40005l804w0eg28p4", { name: "Onboarding" }),
    ).toBe("Onboarding");
    // An empty name (e.g. a status-only update on a deleted-then-raced
    // feature) still falls back to the id slice rather than a blank ref.
    expect(describeEntityRef("cmlf3zmw40005l804w0eg28p4", { name: "" })).toBe(
      "cmlf3zmw",
    );
  });
});
