import { describe, it, expect } from "vitest";
import { toolTriggersGoalActivityRefresh } from "./manyChatToolRefresh";

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
