import { describe, it, expect } from "vitest";
import {
  buildGoalUpdatePayload,
  type EditableGoal,
  type GoalEditFormState,
} from "../goalUpdatePayload";

/**
 * The incident these guard against: a `{id, title, status}` update wiped
 * `period` and `workspaceId` and orphaned a goal out of its workspace. The
 * server side is fixed — `updateGoal` is a partial update now — which moves the
 * risk here: the edit form posts explicit nulls to make "clear this field"
 * work, and a null for a field the form was never told about means the same
 * orphaning by a different route.
 */
function form(overrides: Partial<GoalEditFormState> = {}): GoalEditFormState {
  return {
    title: "Ship OKR support",
    description: "",
    whyThisGoal: "",
    notes: "",
    dueDate: null,
    period: "Q3-2026",
    status: "active",
    lifeDomainId: null,
    selectedProjectId: undefined,
    driUserId: null,
    // What the form seeds to when the caller's goal object omitted these.
    selectedWorkspaceId: null,
    parentGoalId: null,
    ...overrides,
  };
}

describe("buildGoalUpdatePayload — never claims a field the caller withheld", () => {
  // GoalsTable's shape: no workspaceId, no parentGoalId.
  it("omits workspaceId and parentGoalId when the goal prop lacked them", () => {
    const goal: EditableGoal = { id: 46 };

    const payload = buildGoalUpdatePayload(goal, form());

    expect("workspaceId" in payload).toBe(false);
    expect("parentGoalId" in payload).toBe(false);
    expect(payload.title).toBe("Ship OKR support");
  });

  it("sends a workspace the prop carried, including a real null", () => {
    const withWorkspace = buildGoalUpdatePayload(
      { id: 46, workspaceId: "ws1" },
      form({ selectedWorkspaceId: "ws1" }),
    );
    expect(withWorkspace.workspaceId).toBe("ws1");

    // A personal goal genuinely has workspaceId: null — present, so it sends.
    const personal = buildGoalUpdatePayload(
      { id: 46, workspaceId: null },
      form({ selectedWorkspaceId: null }),
    );
    expect("workspaceId" in personal).toBe(true);
    expect(personal.workspaceId).toBeNull();
  });

  it("lets the user actually clear a field the prop carried", () => {
    const payload = buildGoalUpdatePayload(
      { id: 46, workspaceId: "ws1", parentGoalId: 15 },
      form({
        selectedWorkspaceId: null,
        parentGoalId: null,
      }),
    );

    expect(payload.workspaceId).toBeNull();
    expect(payload.parentGoalId).toBeNull();
  });

  it("converts the parent picker's string to a number", () => {
    const payload = buildGoalUpdatePayload(
      { id: 47, parentGoalId: 15 },
      form({ parentGoalId: "15" }),
    );

    expect(payload.parentGoalId).toBe(15);
  });

  it("normalises empty text inputs to null so they clear", () => {
    const payload = buildGoalUpdatePayload(
      { id: 46 },
      form({ description: "", whyThisGoal: "", notes: "" }),
    );

    expect(payload.description).toBeNull();
    expect(payload.whyThisGoal).toBeNull();
    expect(payload.notes).toBeNull();
  });

  // projectId is seeded from the caller's project prop rather than the goal, so
  // an unset value must not read as "unlink every project".
  it("leaves projectId undefined when the form has no project selected", () => {
    const payload = buildGoalUpdatePayload({ id: 46 }, form());

    expect(payload.projectId).toBeUndefined();
  });

  // The specific regression: GoalsTable renaming a workspace goal.
  it("a rename from a prop without workspaceId cannot orphan the goal", () => {
    const goal: EditableGoal = { id: 46 };

    const payload = buildGoalUpdatePayload(
      goal,
      form({ title: "Renamed", selectedWorkspaceId: null }),
    );

    expect(payload.title).toBe("Renamed");
    expect("workspaceId" in payload).toBe(false);
    expect("parentGoalId" in payload).toBe(false);
  });
});
