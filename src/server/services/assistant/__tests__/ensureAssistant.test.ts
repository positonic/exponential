import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_ASSISTANT_NAME, ensureAssistantForUser } from "../ensureAssistant";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";
const SHADOW_USER_ID = "user-shadow";
const AGENT_ID = "agent-1";

describe("ensureAssistantForUser", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
  /** Every mocked write, in call order. */
  let writes: string[];

  beforeEach(() => {
    mockReset(db);
    writes = [];
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.user.create.mockImplementation((() => {
      writes.push("user");
      return Promise.resolve({ id: SHADOW_USER_ID });
    }) as never);
    db.externalAgent.create.mockImplementation((() => {
      writes.push("externalAgent");
      return Promise.resolve({ id: AGENT_ID });
    }) as never);
    db.workspaceUser.upsert.mockImplementation((() => {
      writes.push("workspaceUser");
      return Promise.resolve({});
    }) as never);
    db.assistant.create.mockImplementation(((args: { data: Record<string, unknown> }) => {
      writes.push("assistant");
      return Promise.resolve({ id: "asst-new", ...args.data });
    }) as never);
  });

  it("returns the person's existing Assistant untouched, writing nothing", async () => {
    db.assistant.findFirst.mockResolvedValue({ id: "asst-1", name: "Max" } as never);

    const result = await ensureAssistantForUser(db, USER_ID, {
      workspaceId: WORKSPACE_ID,
      name: "Ignored",
    });

    expect(result).toEqual({ assistant: { id: "asst-1", name: "Max" }, created: false });
    expect(writes).toEqual([]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("creates principal then Assistant in one transaction, named Zoe by default", async () => {
    db.assistant.findFirst.mockResolvedValue(null);

    const result = await ensureAssistantForUser(db, USER_ID, { workspaceId: WORKSPACE_ID });

    expect(result.created).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(["user", "externalAgent", "workspaceUser", "assistant"]);
    expect(DEFAULT_ASSISTANT_NAME).toBe("Zoe");
    expect(db.user.create.mock.calls[0]?.[0]).toMatchObject({
      data: { name: "Zoe", isAgent: true },
    });
    expect(db.assistant.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        name: "Zoe",
        personality: "",
        createdById: USER_ID,
        workspaceId: WORKSPACE_ID,
        isDefault: true,
        externalAgentId: AGENT_ID,
      },
    });
  });

  it("applies the persona it is given to a new Assistant", async () => {
    db.assistant.findFirst.mockResolvedValue(null);

    await ensureAssistantForUser(db, USER_ID, {
      workspaceId: WORKSPACE_ID,
      name: "Aria",
      emoji: "✨",
      personality: "Warm, direct.",
      userContext: "Runs a studio.",
    });

    expect(db.assistant.create.mock.calls[0]?.[0]).toMatchObject({
      data: { name: "Aria", emoji: "✨", personality: "Warm, direct.", userContext: "Runs a studio." },
    });
  });

  it("skips the membership row when asked to", async () => {
    db.assistant.findFirst.mockResolvedValue(null);

    await ensureAssistantForUser(db, USER_ID, { workspaceId: WORKSPACE_ID, grantMembership: false });

    expect(writes).toEqual(["user", "externalAgent", "assistant"]);
  });

  it("resolves a lost race on the one-per-person index to the winner's Assistant", async () => {
    db.assistant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "asst-winner", name: "Zoe" } as never);
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      ensureAssistantForUser(db, USER_ID, { workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual({ assistant: { id: "asst-winner", name: "Zoe" }, created: false });
  });

  it("propagates any other failure", async () => {
    db.assistant.findFirst.mockResolvedValue(null);
    db.$transaction.mockRejectedValue(new Error("db down"));

    await expect(
      ensureAssistantForUser(db, USER_ID, { workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow("db down");
  });
});
