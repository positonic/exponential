import { describe, it, expect } from "vitest";
import {
  buildFeatureFacetOptions,
  countActiveFeatureFilters,
  matchesFeatureFilters,
  parseSavedFeatureFilters,
  EMPTY_FEATURE_FILTERS,
  FILTER_NONE,
  type FeatureFilters,
  type FilterableFeature,
} from "../featureFilters";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const billing = { id: "a-billing", name: "Billing", displayOrder: 1 };
const onboarding = { id: "a-onboarding", name: "Onboarding", displayOrder: 0 };
const growth = { id: 7, title: "Grow revenue" };

function feature(overrides: Partial<FilterableFeature> & { id: string }): FilterableFeature & { id: string } {
  return { status: "IDEA", priority: null, area: null, goal: null, tags: [], ...overrides };
}

function tag(id: string, name: string) {
  return { tag: { id, name } };
}

const filters = (patch: Partial<FeatureFilters>): FeatureFilters => ({
  ...EMPTY_FEATURE_FILTERS,
  ...patch,
});

const values = (opts: Array<{ value: string }>) => opts.map((o) => o.value);
const labels = (opts: Array<{ label: string }>) => opts.map((o) => o.label);

// ---------------------------------------------------------------------------

describe("buildFeatureFacetOptions", () => {
  it("offers only the statuses present, in lifecycle order with display labels", () => {
    const opts = buildFeatureFacetOptions([
      feature({ id: "f1", status: "SHIPPED" }),
      feature({ id: "f2", status: "IDEA" }),
      feature({ id: "f3", status: "IN_PROGRESS" }),
    ]);

    expect(values(opts.status)).toEqual(["IDEA", "IN_PROGRESS", "SHIPPED"]);
    expect(labels(opts.status)).toEqual(["Idea", "In progress", "Live"]);
  });

  it("folds a stored 4 and an unset priority into one last 'No priority' option", () => {
    const opts = buildFeatureFacetOptions([
      feature({ id: "f1", priority: 4 }),
      feature({ id: "f2", priority: null }),
      feature({ id: "f3", priority: 2 }),
      feature({ id: "f4", priority: 0 }),
    ]);

    expect(values(opts.priority)).toEqual(["0", "2", FILTER_NONE]);
    expect(labels(opts.priority)).toEqual(["Urgent", "Medium", "No priority"]);
  });

  it("orders areas by the product's display order, unsorted features last", () => {
    const opts = buildFeatureFacetOptions([
      feature({ id: "f1", area: null }),
      feature({ id: "f2", area: billing }),
      feature({ id: "f3", area: onboarding }),
    ]);

    expect(labels(opts.area)).toEqual(["Onboarding", "Billing", "No area"]);
    expect(values(opts.area)).toEqual(["a-onboarding", "a-billing", FILTER_NONE]);
  });

  it("keys goals by their stringified id", () => {
    const opts = buildFeatureFacetOptions([
      feature({ id: "f1", goal: growth }),
      feature({ id: "f2", goal: null }),
    ]);

    expect(opts.goal).toEqual([
      { value: "7", label: "Grow revenue" },
      { value: FILTER_NONE, label: "No goal" },
    ]);
  });

  it("leaves out a bucketed facet that has a single bucket", () => {
    // Every feature is an unprioritised Idea with no area or goal: none of
    // those facets could narrow the list.
    const opts = buildFeatureFacetOptions([feature({ id: "f1" }), feature({ id: "f2" })]);

    expect(opts.status).toEqual([]);
    expect(opts.priority).toEqual([]);
    expect(opts.area).toEqual([]);
    expect(opts.goal).toEqual([]);
  });

  it("keeps a lone label: it still separates tagged from untagged features", () => {
    const opts = buildFeatureFacetOptions([
      feature({ id: "f1", tags: [tag("t-ai", "AI")] }),
      feature({ id: "f2" }),
    ]);

    expect(opts.labels).toEqual([{ value: "t-ai", label: "AI" }]);
  });

  it("sorts labels alphabetically, ignoring case, without duplicates", () => {
    const opts = buildFeatureFacetOptions([
      feature({ id: "f1", tags: [tag("t-b", "beta"), tag("t-a", "Alpha")] }),
      feature({ id: "f2", tags: [tag("t-b", "beta")] }),
    ]);

    expect(labels(opts.labels)).toEqual(["Alpha", "beta"]);
  });
});

describe("matchesFeatureFilters", () => {
  const f = feature({
    id: "f1",
    status: "IN_PROGRESS",
    priority: 1,
    area: billing,
    goal: growth,
    tags: [tag("t-ai", "AI")],
  });

  it("passes everything when no filter is set", () => {
    expect(matchesFeatureFilters(f, EMPTY_FEATURE_FILTERS)).toBe(true);
  });

  it("ORs the values inside one facet", () => {
    expect(matchesFeatureFilters(f, filters({ status: ["IDEA", "IN_PROGRESS"] }))).toBe(true);
    expect(matchesFeatureFilters(f, filters({ status: ["IDEA", "SHIPPED"] }))).toBe(false);
  });

  it("ANDs across facets", () => {
    expect(
      matchesFeatureFilters(f, filters({ status: ["IN_PROGRESS"], area: ["a-billing"] })),
    ).toBe(true);
    expect(
      matchesFeatureFilters(f, filters({ status: ["IN_PROGRESS"], area: ["a-onboarding"] })),
    ).toBe(false);
  });

  it("matches the unset bucket for area, goal and priority", () => {
    const bare = feature({ id: "f2" });
    const none = filters({ area: [FILTER_NONE], goal: [FILTER_NONE], priority: [FILTER_NONE] });

    expect(matchesFeatureFilters(bare, none)).toBe(true);
    expect(matchesFeatureFilters(feature({ id: "f3", priority: 4 }), none)).toBe(true);
    expect(matchesFeatureFilters(f, none)).toBe(false);
  });

  it("matches a goal by its stringified id", () => {
    expect(matchesFeatureFilters(f, filters({ goal: ["7"] }))).toBe(true);
    expect(matchesFeatureFilters(f, filters({ goal: ["8"] }))).toBe(false);
  });

  it("matches when the feature carries any of the picked labels", () => {
    expect(matchesFeatureFilters(f, filters({ labels: ["t-ai", "t-other"] }))).toBe(true);
    expect(matchesFeatureFilters(f, filters({ labels: ["t-other"] }))).toBe(false);
    expect(matchesFeatureFilters(feature({ id: "f2" }), filters({ labels: ["t-ai"] }))).toBe(false);
  });
});

describe("countActiveFeatureFilters", () => {
  it("counts every picked value across facets", () => {
    expect(countActiveFeatureFilters(EMPTY_FEATURE_FILTERS)).toBe(0);
    expect(
      countActiveFeatureFilters(filters({ status: ["IDEA", "DEFINED"], labels: ["t-ai"] })),
    ).toBe(3);
  });
});

describe("parseSavedFeatureFilters", () => {
  it("falls back to no filters for anything that isn't an object", () => {
    expect(parseSavedFeatureFilters(undefined)).toEqual(EMPTY_FEATURE_FILTERS);
    expect(parseSavedFeatureFilters(null)).toEqual(EMPTY_FEATURE_FILTERS);
    expect(parseSavedFeatureFilters("status")).toEqual(EMPTY_FEATURE_FILTERS);
  });

  it("keeps well-formed facets and drops malformed ones", () => {
    expect(
      parseSavedFeatureFilters({
        status: ["IDEA"],
        priority: "1",
        area: ["a-billing", 3, null],
        unknown: ["x"],
      }),
    ).toEqual(filters({ status: ["IDEA"], area: ["a-billing"] }));
  });
});
