import { describe, it, expect } from "vitest";
import { assignmentOffer } from "../assignmentOffer";

describe("assignmentOffer", () => {
  it("offers nothing when every mentioned Assistant was started (or none was mentioned)", () => {
    expect(assignmentOffer([])).toBeNull();
  });

  it("names one unassigned Assistant and offers to assign it", () => {
    expect(assignmentOffer([{ id: "aria-shadow", name: "Aria" }])).toEqual({
      message: "Aria isn't assigned to this action, so mentioning it didn't start anything.",
      buttonLabel: "Assign Aria",
      userIds: ["aria-shadow"],
    });
  });

  it("lists several and assigns them all at once", () => {
    expect(
      assignmentOffer([
        { id: "a", name: "Aria" },
        { id: "m", name: "Max" },
        { id: "z", name: null },
      ]),
    ).toEqual({
      message: "Aria, Max and Your Assistant aren't assigned to this action, so mentioning them didn't start anything.",
      buttonLabel: "Assign them",
      userIds: ["a", "m", "z"],
    });
  });
});
