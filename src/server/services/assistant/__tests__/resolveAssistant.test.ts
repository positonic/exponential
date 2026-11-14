import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { resolveAssistantForUser } from "../resolveAssistant";

const USER_ID = "user-1";

describe("resolveAssistantForUser", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
  });

  it("looks up the caller's non-retired Assistant with no workspace in the query", async () => {
    db.assistant.findFirst.mockResolvedValue(null);

    await resolveAssistantForUser(db, USER_ID);

    expect(db.assistant.findFirst).toHaveBeenCalledWith({
      where: { createdById: USER_ID, retiredAt: null },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("returns the Assistant it finds", async () => {
    db.assistant.findFirst.mockResolvedValue({ id: "asst-1", name: "Zoe" } as never);

    await expect(resolveAssistantForUser(db, USER_ID)).resolves.toMatchObject({ id: "asst-1" });
  });

  it("returns null for a person with no Assistant", async () => {
    db.assistant.findFirst.mockResolvedValue(null);

    await expect(resolveAssistantForUser(db, USER_ID)).resolves.toBeNull();
  });
});
