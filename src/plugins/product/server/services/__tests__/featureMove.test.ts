/**
 * Unit tests for the pure {@link planFeatureMove} planner (ADR-0027).
 *
 * No DB, no harness — the planner is a pure function, so these import it
 * directly and assert on the returned plan + loss summary. This slice covers
 * the feature-level rules (goal / insights / tags) and the ticket-less path;
 * ticket renumbering and per-ticket severances are exercised by later slices.
 */

import { describe, it, expect } from "vitest";
import {
  planFeatureMove,
  type FeatureMoveGraph,
  type FeatureMoveDestination,
} from "../featureMove";

const DEST: FeatureMoveDestination = {
  productId: "dest-product",
  ticketCounter: 0,
  funTicketIds: false,
  usedNumbers: [],
  usedShortIds: [],
  memberUserIds: [],
};

function graph(overrides: Partial<FeatureMoveGraph> = {}): FeatureMoveGraph {
  return {
    featureId: "feat-1",
    goalId: null,
    tags: [],
    insightIds: [],
    tickets: [],
    dependencies: [],
    ...overrides,
  };
}

describe("planFeatureMove — feature-level rules", () => {
  it("re-points the feature at the destination product", () => {
    const { mutations } = planFeatureMove(graph(), DEST);
    expect(mutations.featureId).toBe("feat-1");
    expect(mutations.destinationProductId).toBe("dest-product");
  });

  it("nulls a set goal alignment and reports the loss", () => {
    const { mutations, loss } = planFeatureMove(graph({ goalId: 42 }), DEST);
    expect(mutations.nullGoal).toBe(true);
    expect(loss.goalAlignmentRemoved).toBe(true);
  });

  it("leaves goal untouched when there is no alignment", () => {
    const { mutations, loss } = planFeatureMove(graph({ goalId: null }), DEST);
    expect(mutations.nullGoal).toBe(false);
    expect(loss.goalAlignmentRemoved).toBe(false);
  });

  it("drops all feature-insight links", () => {
    const { mutations, loss } = planFeatureMove(
      graph({ insightIds: ["ins-1", "ins-2"] }),
      DEST,
    );
    expect(mutations.dropInsightIds).toEqual(["ins-1", "ins-2"]);
    expect(loss.insightLinksDropped).toBe(2);
  });

  it("drops workspace-scoped tags but keeps global tags", () => {
    const { mutations, loss } = planFeatureMove(
      graph({
        tags: [
          { tagId: "global", tagWorkspaceId: null },
          { tagId: "ws-scoped-a", tagWorkspaceId: "ws-src" },
          { tagId: "ws-scoped-b", tagWorkspaceId: "ws-src" },
        ],
      }),
      DEST,
    );
    expect(mutations.dropTagIds).toEqual(["ws-scoped-a", "ws-scoped-b"]);
    expect(loss.tagsDropped).toBe(2);
  });

  it("renumbers moving tickets into the destination sequence", () => {
    const { mutations, loss } = planFeatureMove(
      graph({
        tickets: [
          { id: "tk-1", number: 7, shortId: null, cycleId: null, assigneeId: null, childActionIds: [] },
          { id: "tk-2", number: 8, shortId: null, cycleId: null, assigneeId: null, childActionIds: [] },
        ],
      }),
      { ...DEST, ticketCounter: 40, usedNumbers: [40] },
    );
    expect(mutations.ticketIds).toEqual(["tk-1", "tk-2"]);
    expect(mutations.ticketRenumber.map((r) => r.number)).toEqual([41, 42]);
    expect(mutations.nextTicketCounter).toBe(42);
    expect(loss.ticketsMoved).toBe(2);
    expect(loss.ticketsRenumbered).toBe(2);
  });

  it("reports an empty loss summary for a clean ticket-less move", () => {
    const { mutations, loss } = planFeatureMove(graph(), DEST);
    expect(mutations.ticketIds).toEqual([]);
    expect(mutations.ticketRenumber).toEqual([]);
    expect(mutations.nextTicketCounter).toBe(0);
    expect(loss).toEqual({
      ticketsMoved: 0,
      ticketsRenumbered: 0,
      cyclesDropped: 0,
      dependenciesPreserved: 0,
      dependenciesDropped: 0,
      assigneesCleared: 0,
      childActionsUnlinked: 0,
      goalAlignmentRemoved: false,
      insightLinksDropped: 0,
      tagsDropped: 0,
    });
  });
});
