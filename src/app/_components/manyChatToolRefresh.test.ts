import { describe, it, expect } from "vitest";
import {
  toolTriggersGoalActivityRefresh,
  toolTriggersActionRefresh,
  entitiesToRefresh,
} from "./manyChatToolRefresh";

describe("toolTriggersGoalActivityRefresh", () => {
  it("matches the objective comment/update tools across name forms", () => {
    // Registration key (what the chat stream emits today)
    expect(toolTriggersGoalActivityRefresh("addObjectiveUpdateTool")).toBe(true);
    expect(toolTriggersGoalActivityRefresh("addObjectiveCommentTool")).toBe(true);
    // createTool id
    expect(toolTriggersGoalActivityRefresh("add-objective-update")).toBe(true);
    expect(toolTriggersGoalActivityRefresh("add-objective-comment")).toBe(true);
    // Humanized label
    expect(toolTriggersGoalActivityRefresh("Add objective comment")).toBe(true);
    expect(toolTriggersGoalActivityRefresh("Add objective update")).toBe(true);
  });

  it("does not match unrelated tools", () => {
    expect(toolTriggersGoalActivityRefresh("createProjectTool")).toBe(false);
    expect(toolTriggersGoalActivityRefresh("getAllProjectsTool")).toBe(false);
    expect(toolTriggersGoalActivityRefresh("checkInOkrKeyResultTool")).toBe(false);
    expect(toolTriggersGoalActivityRefresh("")).toBe(false);
  });
});

describe("toolTriggersActionRefresh", () => {
  it("matches the five action-mutating tools across name forms", () => {
    // Registration key, createTool id, and humanized label all normalize the same.
    expect(toolTriggersActionRefresh("createActionTool")).toBe(true);
    expect(toolTriggersActionRefresh("quick-create-action")).toBe(true);
    expect(toolTriggersActionRefresh("createProjectActionTool")).toBe(true);
    expect(toolTriggersActionRefresh("update-action")).toBe(true);
    expect(toolTriggersActionRefresh("Delete action")).toBe(true);
    // Kanban moves are action mutations too.
    expect(toolTriggersActionRefresh("moveActionTool")).toBe(true);
  });

  it("does not match read-only action tools or non-action tools", () => {
    // Has the noun but no mutating verb.
    expect(toolTriggersActionRefresh("getAllActionsTool")).toBe(false);
    expect(toolTriggersActionRefresh("list-actions")).toBe(false);
    // Has a mutating verb but is not about actions (goal-activity tool).
    expect(toolTriggersActionRefresh("add-objective-update")).toBe(false);
    expect(toolTriggersActionRefresh("createProjectTool")).toBe(false);
    expect(toolTriggersActionRefresh("")).toBe(false);
  });
});

describe("entitiesToRefresh", () => {
  it("returns 'action' for each action tool-name variant, regardless of page", () => {
    for (const name of [
      "createActionTool",
      "quick-create-action",
      "create-project-action",
      "update-action",
      "delete-action",
    ]) {
      expect(entitiesToRefresh([name], undefined).has("action")).toBe(true);
      // Action surfaces on many pages, so no page guard.
      expect(entitiesToRefresh([name], "goal").has("action")).toBe(true);
      expect(entitiesToRefresh([name], "workspace").has("action")).toBe(true);
    }
  });

  it("returns an empty set for an unrelated tool", () => {
    expect(entitiesToRefresh(["getAllProjectsTool"], "workspace").size).toBe(0);
    expect(entitiesToRefresh([], "goal").size).toBe(0);
  });

  it("guards goalActivity to goal pages only", () => {
    expect(entitiesToRefresh(["add-objective-update"], "goal").has("goalActivity")).toBe(true);
    // Same tool off a goal page → no goalActivity refresh.
    expect(entitiesToRefresh(["add-objective-update"], "workspace").has("goalActivity")).toBe(false);
    expect(entitiesToRefresh(["add-objective-update"], undefined).has("goalActivity")).toBe(false);
  });

  it("returns both entities for a mixed batch on a goal page", () => {
    const result = entitiesToRefresh(
      ["add-objective-update", "quick-create-action"],
      "goal",
    );
    expect(result.has("goalActivity")).toBe(true);
    expect(result.has("action")).toBe(true);
  });
});
