import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "~/server/services/access/resolvers/workspaceResolver";
import { findGatewayAssistant } from "../gatewayAssistant";

const USER_ID = "user-1";

const inWorkspace = (workspaceId: string, name: string) => ({
  id: `asst-${workspaceId}`,
  name,
  workspaceId,
  workspace: { name: `Workspace ${workspaceId}` },
});

describe("findGatewayAssistant", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
  });

  it("prefers the default assistant in the user's default workspace", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-b" } as never);
    // most recently edited first, as the query orders them
    db.assistant.findMany.mockResolvedValue([
      inWorkspace("ws-a", "Aria"),
      inWorkspace("ws-b", "Max"),
    ] as never);

    await expect(findGatewayAssistant(db, USER_ID)).resolves.toMatchObject({
      name: "Max",
      workspaceId: "ws-b",
    });
  });

  it("falls back to the most recently edited default assistant", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-none" } as never);
    db.assistant.findMany.mockResolvedValue([
      inWorkspace("ws-a", "Aria"),
      inWorkspace("ws-b", "Max"),
    ] as never);

    await expect(findGatewayAssistant(db, USER_ID)).resolves.toMatchObject({
      name: "Aria",
    });
  });

  it("returns null when the user has no default assistant", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.assistant.findMany.mockResolvedValue([] as never);

    await expect(findGatewayAssistant(db, USER_ID)).resolves.toBeNull();
  });

  it("only considers the caller's default assistants in workspaces they can still access, newest first", async () => {
    db.user.findUnique.mockResolvedValue(null as never);
    db.assistant.findMany.mockResolvedValue([] as never);

    await findGatewayAssistant(db, USER_ID);

    expect(db.assistant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdById: USER_ID,
          isDefault: true,
          workspace: buildWorkspaceAccessWhere(USER_ID),
        },
        orderBy: { updatedAt: "desc" },
      }),
    );
  });
});
