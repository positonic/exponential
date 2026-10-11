import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { findUnstartedAssistantMentions } from "../unstartedMentions";

const ACTION = "action-1";

describe("findUnstartedAssistantMentions (decided 2026-10-11: a mention never starts a run)", () => {
  const db = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
  });

  it("names a mentioned Assistant that is not assigned to the action", async () => {
    db.user.findMany.mockResolvedValue([{ id: "aria-shadow", name: "Aria" }] as never);
    db.actionAssignee.findMany.mockResolvedValue([] as never);

    const result = await findUnstartedAssistantMentions(db, {
      actionId: ACTION,
      content: "@[Aria](aria-shadow) please look, cc @[Ana](ana)",
    });

    expect(result).toEqual([{ id: "aria-shadow", name: "Aria" }]);
    // Only Assistant principals among the mentioned ids qualify.
    expect(db.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["aria-shadow", "ana"] },
        externalAgentShadow: { is: { assistant: { isNot: null } } },
      },
      select: { id: true, name: true },
    });
  });

  it("leaves out an Assistant already assigned — assignment, not the mention, runs it", async () => {
    db.user.findMany.mockResolvedValue([{ id: "aria-shadow", name: "Aria" }] as never);
    db.actionAssignee.findMany.mockResolvedValue([{ userId: "aria-shadow" }] as never);

    await expect(
      findUnstartedAssistantMentions(db, { actionId: ACTION, content: "@[Aria](aria-shadow) go" }),
    ).resolves.toEqual([]);
  });

  it("reads nothing for a comment without mentions, or mentioning only people", async () => {
    await expect(findUnstartedAssistantMentions(db, { actionId: ACTION, content: "no mentions" })).resolves.toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();

    db.user.findMany.mockResolvedValue([] as never);
    await expect(
      findUnstartedAssistantMentions(db, { actionId: ACTION, content: "@[Ana](ana) hi" }),
    ).resolves.toEqual([]);
    expect(db.actionAssignee.findMany).not.toHaveBeenCalled();
  });
});
