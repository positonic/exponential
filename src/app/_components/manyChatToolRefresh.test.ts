import { describe, it, expect } from "vitest";
import {
  toolTriggersGoalActivityRefresh,
  toolTriggersActionRefresh,
  toolTriggersOkrRefresh,
  toolTriggersCrmContactRefresh,
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

describe("toolTriggersOkrRefresh", () => {
  it("matches the objective + key-result mutations across name forms", () => {
    // createTool ids
    expect(toolTriggersOkrRefresh("create-okr-objective")).toBe(true);
    expect(toolTriggersOkrRefresh("update-okr-objective")).toBe(true);
    expect(toolTriggersOkrRefresh("delete-okr-objective")).toBe(true);
    expect(toolTriggersOkrRefresh("create-okr-key-result")).toBe(true);
    expect(toolTriggersOkrRefresh("update-okr-key-result")).toBe(true);
    expect(toolTriggersOkrRefresh("delete-okr-key-result")).toBe(true);
    expect(toolTriggersOkrRefresh("checkin-okr-key-result")).toBe(true);
    // Registration key + humanized label normalize the same.
    expect(toolTriggersOkrRefresh("createOkrKeyResultTool")).toBe(true);
    expect(toolTriggersOkrRefresh("Update okr objective")).toBe(true);
  });

  it("matches the (un)link / nest tools that restructure the OKR tree", () => {
    expect(toolTriggersOkrRefresh("link-project-to-goal")).toBe(true);
    expect(toolTriggersOkrRefresh("unlink-project-from-goal")).toBe(true);
    expect(toolTriggersOkrRefresh("link-objective-to-parent")).toBe(true);
  });

  it("does not match read-only OKR tools or unrelated tools", () => {
    // Carry the noun but no mutating verb.
    expect(toolTriggersOkrRefresh("get-okr-objectives")).toBe(false);
    expect(toolTriggersOkrRefresh("get-okr-stats")).toBe(false);
    expect(toolTriggersOkrRefresh("createActionTool")).toBe(false);
    expect(toolTriggersOkrRefresh("")).toBe(false);
  });
});

describe("toolTriggersCrmContactRefresh", () => {
  it("matches the contact-mutating tools across name forms", () => {
    // createTool ids
    expect(toolTriggersCrmContactRefresh("create-crm-contact")).toBe(true);
    expect(toolTriggersCrmContactRefresh("create-full-crm-contact")).toBe(true);
    expect(toolTriggersCrmContactRefresh("update-crm-contact")).toBe(true);
    expect(toolTriggersCrmContactRefresh("delete-crm-contact")).toBe(true);
    // Registration key + humanized label normalize the same.
    expect(toolTriggersCrmContactRefresh("createFullCrmContactTool")).toBe(true);
    expect(toolTriggersCrmContactRefresh("Create full crm contact")).toBe(true);
  });

  it("matches logging an interaction (reorders + restats the list)", () => {
    expect(toolTriggersCrmContactRefresh("add-crm-interaction")).toBe(true);
    expect(toolTriggersCrmContactRefresh("addCrmInteractionTool")).toBe(true);
  });

  it("does not match read-only contact tools or unrelated CRM tools", () => {
    // Carry the noun but no mutating verb.
    expect(toolTriggersCrmContactRefresh("search-crm-contacts")).toBe(false);
    expect(toolTriggersCrmContactRefresh("get-crm-contact")).toBe(false);
    // Organization writes aren't rendered by the contacts list.
    expect(toolTriggersCrmContactRefresh("create-crm-organization")).toBe(false);
    expect(toolTriggersCrmContactRefresh("createActionTool")).toBe(false);
    expect(toolTriggersCrmContactRefresh("")).toBe(false);
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

  it("returns 'okr' for OKR mutations on any page (no page guard)", () => {
    for (const name of [
      "create-okr-objective",
      "update-okr-objective",
      "create-okr-key-result",
      "checkin-okr-key-result",
      "link-project-to-goal",
    ]) {
      expect(entitiesToRefresh([name], "okrs").has("okr")).toBe(true);
      // OKR queries only mount on the dashboard, so firing anywhere is near-free.
      expect(entitiesToRefresh([name], undefined).has("okr")).toBe(true);
      expect(entitiesToRefresh([name], "workspace").has("okr")).toBe(true);
    }
  });

  it("returns 'crmContact' for contact mutations on any page (no page guard)", () => {
    for (const name of [
      "create-crm-contact",
      "create-full-crm-contact",
      "update-crm-contact",
      "delete-crm-contact",
      "add-crm-interaction",
    ]) {
      // crmContact queries only mount on the CRM contacts page, so firing
      // anywhere is near-free.
      expect(entitiesToRefresh([name], "contacts").has("crmContact")).toBe(true);
      expect(entitiesToRefresh([name], undefined).has("crmContact")).toBe(true);
      expect(entitiesToRefresh([name], "workspace").has("crmContact")).toBe(true);
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
