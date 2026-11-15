import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "~/server/services/access/resolvers/workspaceResolver";
import { resolveGatewayPairing } from "../gatewayPairing";

const USER_ID = "user-1";

describe("resolveGatewayPairing (Agent PRD D13)", () => {
  const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

  beforeEach(() => {
    mockReset(db);
    db.assistant.findFirst.mockResolvedValue({ id: "asst-1", name: "Zoe", personality: "secret" } as never);
  });

  it("returns the person's Assistant (identity only) and their default workspace, if still accessible", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-default" } as never);
    db.workspace.findFirst.mockResolvedValue({ id: "ws-default" } as never);

    await expect(resolveGatewayPairing(db, USER_ID)).resolves.toEqual({
      assistant: { id: "asst-1", name: "Zoe" },
      workspaceId: "ws-default",
    });
    // The Assistant is resolved with no workspace (ADR-0072).
    expect(db.assistant.findFirst.mock.calls[0]?.[0]?.where).toEqual({ createdById: USER_ID, retiredAt: null });
    expect(db.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: "ws-default", ...buildWorkspaceAccessWhere(USER_ID) },
      select: { id: true },
    });
  });

  it("skips a stale default the person was removed from, falling back to their Personal workspace", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-left" } as never);
    // The access-checked lookup misses; the Personal lookup finds theirs.
    db.workspace.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "ws-personal" } as never);

    await expect(resolveGatewayPairing(db, USER_ID)).resolves.toMatchObject({ workspaceId: "ws-personal" });
  });

  it("falls back to the Personal workspace when there is no default", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    await expect(resolveGatewayPairing(db, USER_ID)).resolves.toMatchObject({ workspaceId: "ws-personal" });
  });

  it("then to the oldest membership, and only to null with no workspace at all", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValue(null);
    db.workspaceUser.findFirst.mockResolvedValue({ workspaceId: "ws-team" } as never);

    await expect(resolveGatewayPairing(db, USER_ID)).resolves.toMatchObject({ workspaceId: "ws-team" });

    db.workspaceUser.findFirst.mockResolvedValue(null);
    await expect(resolveGatewayPairing(db, USER_ID)).resolves.toMatchObject({ workspaceId: null });
  });

  it("returns no Assistant for a person who has none, still with a workspace", async () => {
    db.assistant.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-default" } as never);
    db.workspace.findFirst.mockResolvedValue({ id: "ws-default" } as never);

    await expect(resolveGatewayPairing(db, USER_ID)).resolves.toEqual({ assistant: null, workspaceId: "ws-default" });
  });
});
