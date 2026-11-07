import { describe, it, expect } from "vitest";
import { planAssistantRetirement, type RetirementCandidate } from "../retirementPlan";

const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`);

function candidate(
  id: string,
  overrides: Partial<Omit<RetirementCandidate, "id">> = {},
): RetirementCandidate {
  return {
    id,
    workspaceId: `ws-${id}`,
    isDefault: true,
    updatedAt: at(1),
    ownerHasAccess: true,
    ...overrides,
  };
}

describe("planAssistantRetirement", () => {
  it("returns null for a person with no Assistant", () => {
    expect(planAssistantRetirement([], { defaultWorkspaceId: null })).toBeNull();
  });

  it("keeps a lone Assistant and retires nothing", () => {
    expect(
      planAssistantRetirement([candidate("a", { isDefault: false, ownerHasAccess: false })], {
        defaultWorkspaceId: null,
      }),
    ).toEqual({ survivorId: "a", retireIds: [] });
  });

  it("keeps the default Assistant in the person's default workspace, even if older", () => {
    const plan = planAssistantRetirement(
      [
        candidate("newer", { updatedAt: at(9) }),
        candidate("home", { workspaceId: "ws-home", updatedAt: at(1) }),
      ],
      { defaultWorkspaceId: "ws-home" },
    );
    expect(plan).toEqual({ survivorId: "home", retireIds: ["newer"] });
  });

  it("with several defaults and none in the default workspace, keeps the most recently edited", () => {
    const plan = planAssistantRetirement(
      [
        candidate("old", { updatedAt: at(2) }),
        candidate("new", { updatedAt: at(8) }),
        candidate("mid", { updatedAt: at(5) }),
      ],
      { defaultWorkspaceId: "ws-elsewhere" },
    );
    expect(plan).toEqual({ survivorId: "new", retireIds: ["mid", "old"] });
  });

  it("prefers a default Assistant over a more recently edited non-default one", () => {
    const plan = planAssistantRetirement(
      [
        candidate("plain", { isDefault: false, updatedAt: at(9) }),
        candidate("dflt", { updatedAt: at(1) }),
      ],
      { defaultWorkspaceId: null },
    );
    expect(plan?.survivorId).toBe("dflt");
  });

  it("with no default at all, keeps the most recently edited", () => {
    const plan = planAssistantRetirement(
      [
        candidate("a", { isDefault: false, updatedAt: at(3) }),
        candidate("b", { isDefault: false, updatedAt: at(7) }),
      ],
      { defaultWorkspaceId: null },
    );
    expect(plan).toEqual({ survivorId: "b", retireIds: ["a"] });
  });

  it("handles several Assistants in one workspace like any others", () => {
    const plan = planAssistantRetirement(
      [
        candidate("x", { workspaceId: "ws-1", isDefault: false, updatedAt: at(6) }),
        candidate("y", { workspaceId: "ws-1", isDefault: true, updatedAt: at(2) }),
        candidate("z", { workspaceId: "ws-1", isDefault: false, updatedAt: at(4) }),
      ],
      { defaultWorkspaceId: "ws-1" },
    );
    expect(plan).toEqual({ survivorId: "y", retireIds: ["x", "z"] });
  });

  it("never keeps an Assistant in a workspace the person has left while an accessible one exists", () => {
    const plan = planAssistantRetirement(
      [
        // The default in the default workspace — but the person has left it.
        candidate("left", { workspaceId: "ws-home", ownerHasAccess: false, updatedAt: at(9) }),
        candidate("stay", { isDefault: false, updatedAt: at(1) }),
      ],
      { defaultWorkspaceId: "ws-home" },
    );
    expect(plan).toEqual({ survivorId: "stay", retireIds: ["left"] });
  });

  it("still keeps one when the person has left every workspace, the most recently edited", () => {
    const plan = planAssistantRetirement(
      [
        candidate("a", { ownerHasAccess: false, updatedAt: at(2) }),
        candidate("b", { ownerHasAccess: false, updatedAt: at(5) }),
      ],
      { defaultWorkspaceId: null },
    );
    expect(plan).toEqual({ survivorId: "b", retireIds: ["a"] });
  });

  it("breaks an exact tie by id, so the SQL and this agree", () => {
    const plan = planAssistantRetirement([candidate("b"), candidate("a")], {
      defaultWorkspaceId: null,
    });
    expect(plan).toEqual({ survivorId: "a", retireIds: ["b"] });
  });

  it("does not reorder its input", () => {
    const input = [candidate("a", { updatedAt: at(1) }), candidate("b", { updatedAt: at(2) })];
    planAssistantRetirement(input, { defaultWorkspaceId: null });
    expect(input.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
