import { describe, it, expect } from "vitest";
import { deriveActionBlocked, withBlockedState } from "../blocked";

describe("deriveActionBlocked", () => {
  it("counts only ACTIVE blockers", () => {
    const state = deriveActionBlocked({
      status: "ACTIVE",
      depsOut: [
        { dependsOn: { status: "ACTIVE" } },
        { dependsOn: { status: "COMPLETED" } },
        { dependsOn: { status: "CANCELLED" } },
      ],
    });
    expect(state).toEqual({ openBlockerCount: 1, isBlocked: true });
  });

  it("is not blocked when every blocker is finished", () => {
    expect(
      deriveActionBlocked({ status: "ACTIVE", depsOut: [{ dependsOn: { status: "COMPLETED" } }] }),
    ).toEqual({ openBlockerCount: 0, isBlocked: false });
  });

  it("a finished action is never blocked, even with open blockers", () => {
    expect(
      deriveActionBlocked({ status: "COMPLETED", depsOut: [{ dependsOn: { status: "ACTIVE" } }] }),
    ).toEqual({ openBlockerCount: 1, isBlocked: false });
  });

  it("tolerates rows without the include", () => {
    expect(deriveActionBlocked({ status: "ACTIVE" })).toEqual({ openBlockerCount: 0, isBlocked: false });
    expect(deriveActionBlocked({ status: "ACTIVE", depsOut: null })).toEqual({ openBlockerCount: 0, isBlocked: false });
  });

  it("withBlockedState keeps the row and adds the two fields", () => {
    const row = { id: "a", status: "ACTIVE", depsOut: [{ dependsOn: { status: "ACTIVE" } }] };
    expect(withBlockedState(row)).toEqual({ ...row, openBlockerCount: 1, isBlocked: true });
  });
});
