import { describe, it, expect } from "vitest";

import { buildCreateActionPayload } from "../createActionPayload";
import {
  actionWriteSchema,
  actionCreateAttachmentsSchema,
} from "~/server/services/actions/schema";

/** The exact input schema `action.create` parses. */
const createInput = actionWriteSchema.merge(actionCreateAttachmentsSchema);

describe("buildCreateActionPayload", () => {
  it("sends tags, assignees and sprint with the create, and nothing empty", () => {
    const payload = buildCreateActionPayload({
      name: "  Ship it  ",
      projectId: "p1",
      workspaceId: "w1",
      priority: "1st Priority",
      tagIds: ["t1", "t2"],
      assigneeIds: ["u2"],
      sprintListId: "s1",
    });

    expect(payload).toMatchObject({
      name: "Ship it",
      projectId: "p1",
      workspaceId: "w1",
      priority: "1st Priority",
      tagIds: ["t1", "t2"],
      assigneeIds: ["u2"],
      sprintListId: "s1",
    });
    expect(payload).not.toHaveProperty("isBounty");
  });

  it("omits cleared attachments and unset fields rather than sending null or empty", () => {
    const payload = buildCreateActionPayload({
      name: "Inbox",
      projectId: null,
      workspaceId: null,
      description: "",
      dueDate: null,
      duration: null,
      epicId: null,
      effortEstimate: null,
      blockedByIds: [],
      sprintListId: null,
      assigneeIds: [],
      tagIds: [],
    });

    expect(payload).toEqual({
      name: "Inbox",
      description: undefined,
      projectId: undefined,
      workspaceId: undefined,
      priority: "Quick",
      dueDate: undefined,
      scheduledStart: undefined,
      duration: undefined,
      epicId: undefined,
      effortEstimate: undefined,
      blockedByIds: undefined,
    });
    expect(payload).not.toHaveProperty("tagIds");
    expect(payload).not.toHaveProperty("assigneeIds");
    expect(payload).not.toHaveProperty("sprintListId");
  });

  it("carries the bounty group only when the toggle is on", () => {
    const deadline = new Date("2026-10-01T00:00:00.000Z");
    const payload = buildCreateActionPayload({
      name: "Bounty",
      bounty: { amount: 50, token: "USDC", difficulty: "advanced", skills: ["rust"], deadline, maxClaimants: 2 },
    });

    expect(payload).toMatchObject({
      isBounty: true,
      bountyAmount: 50,
      bountyToken: "USDC",
      bountyDifficulty: "advanced",
      bountySkills: ["rust"],
      bountyDeadline: deadline,
      bountyMaxClaimants: 2,
    });
  });

  it("passes an explicit status and copies attachment arrays", () => {
    const tagIds = ["t1"];
    const payload = buildCreateActionPayload({ name: "x", status: "ACTIVE", tagIds });

    expect(payload.status).toBe("ACTIVE");
    expect(payload.tagIds).toEqual(["t1"]);
    expect(payload.tagIds).not.toBe(tagIds);
  });

  it("produces a payload the server's create input accepts, attachments included", () => {
    const payload = buildCreateActionPayload({
      name: "Ship it",
      projectId: "p1",
      workspaceId: "w1",
      priority: "2nd Priority",
      dueDate: new Date("2026-09-20T00:00:00.000Z"),
      duration: 30,
      tagIds: ["t1"],
      assigneeIds: ["u2"],
      sprintListId: "s1",
      bounty: { amount: 10, token: "USDC", maxClaimants: 1 },
    });

    const parsed = createInput.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toMatchObject({
      tagIds: ["t1"],
      assigneeIds: ["u2"],
      sprintListId: "s1",
      isBounty: true,
    });
  });

  it("trims the name, so a whitespace-only name is the caller's to refuse before submit", () => {
    const payload = buildCreateActionPayload({ name: "   " });

    expect(payload.name).toBe("");
    // The server refuses it; both modals guard with `name.trim()` first.
    expect(createInput.safeParse(payload).success).toBe(false);
  });
});
