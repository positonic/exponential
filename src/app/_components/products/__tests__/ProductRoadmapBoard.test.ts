import { describe, expect, it } from "vitest";

import { bucketByStatus } from "../ProductRoadmapBoard";
import type { RouterOutputs } from "~/trpc/react";
import { FEATURE_STATUSES } from "~/lib/feature-statuses";

type RoadmapFeature =
  RouterOutputs["product"]["feature"]["listForWorkspace"][number];

/** Minimal card-shaped feature; only the fields bucketByStatus reads. */
function feature(
  id: string,
  priority: number | null,
  status: RoadmapFeature["status"] = "IDEA",
): RoadmapFeature {
  return { id, priority, status } as RoadmapFeature;
}

describe("bucketByStatus", () => {
  it("creates a bucket for every status", () => {
    const buckets = bucketByStatus([]);
    for (const col of FEATURE_STATUSES) {
      expect(buckets[col.value]).toEqual([]);
    }
  });

  it("sorts each column by priority, Urgent (0) first", () => {
    const buckets = bucketByStatus([
      feature("low", 3),
      feature("urgent", 0),
      feature("medium", 2),
      feature("high", 1),
    ]);
    expect(buckets.IDEA?.map((f) => f.id)).toEqual([
      "urgent",
      "high",
      "medium",
      "low",
    ]);
  });

  it("ranks unset priority the same as the explicit 'No priority' 4", () => {
    // null and 4 render the identical label, so neither may sort ahead of the
    // other: ties keep input (updatedAt-desc) order.
    const buckets = bucketByStatus([
      feature("unset-first", null),
      feature("explicit-none", 4),
      feature("high", 1),
    ]);
    expect(buckets.IDEA?.map((f) => f.id)).toEqual([
      "high",
      "unset-first",
      "explicit-none",
    ]);
  });

  it("keeps input order for equal priorities (stable sort)", () => {
    const buckets = bucketByStatus([
      feature("a", 2),
      feature("b", 2),
      feature("c", 2),
    ]);
    expect(buckets.IDEA?.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("buckets features into their own status columns", () => {
    const buckets = bucketByStatus([
      feature("idea", 1, "IDEA"),
      feature("live", 0, "SHIPPED"),
    ]);
    expect(buckets.IDEA?.map((f) => f.id)).toEqual(["idea"]);
    expect(buckets.SHIPPED?.map((f) => f.id)).toEqual(["live"]);
  });
});
