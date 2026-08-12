/**
 * Unit tests for `resolveWorkspaceId` — the enforcement point for the
 * "onboarding artifacts never land in a shared workspace" acceptance
 * criterion of the welcome flow.
 *
 * Mocked Prisma via `vitest-mock-extended` (see CLAUDE.md "Test database
 * safety" — mocked is the default; these branches need no real DB).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

// `../welcome` imports `~/server/api/trpc`, whose next-auth import chain
// doesn't resolve under vitest — stub it like the other router tests do.
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { resolveWorkspaceId } from "../welcome";

const db = mockDeep<PrismaClient>();
const USER = "user-1";
const OTHER_USER = "user-2";

beforeEach(() => {
  mockReset(db);
});

describe("resolveWorkspaceId", () => {
  it("uses the default workspace when it is the user's own personal workspace", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-own-personal" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-own-personal",
      type: "personal",
      ownerId: USER,
    } as never);

    await expect(resolveWorkspaceId(db, USER)).resolves.toBe("ws-own-personal");
    expect(db.workspace.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the owned personal workspace when the default is a team workspace", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-team" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-team",
      type: "team",
      ownerId: OTHER_USER,
    } as never);
    db.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    await expect(resolveWorkspaceId(db, USER)).resolves.toBe("ws-personal");
    expect(db.workspace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: USER, type: "personal" },
      }),
    );
  });

  it("falls back to the owned personal workspace when the default is someone ELSE's personal workspace", async () => {
    // The review's High finding: type === "personal" alone is not enough —
    // a user can be invited into another user's personal workspace and have
    // it set as their default by signup auto-accept.
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-their-personal" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-their-personal",
      type: "personal",
      ownerId: OTHER_USER,
    } as never);
    db.workspace.findFirst.mockResolvedValue({ id: "ws-personal" } as never);

    await expect(resolveWorkspaceId(db, USER)).resolves.toBe("ws-personal");
  });

  it("keeps the previous resolution order when no personal workspace exists", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-team" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-team",
      type: "team",
      ownerId: OTHER_USER,
    } as never);
    db.workspace.findFirst.mockResolvedValue(null as never);

    // Default exists but is shared, no owned personal → default wins.
    await expect(resolveWorkspaceId(db, USER)).resolves.toBe("ws-team");
  });

  it("falls back to the earliest membership when there is no default and no personal workspace", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValue(null as never);
    db.workspaceUser.findFirst.mockResolvedValue({ workspaceId: "ws-member" } as never);

    await expect(resolveWorkspaceId(db, USER)).resolves.toBe("ws-member");
    expect(db.workspaceUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER },
        orderBy: { joinedAt: "asc" },
      }),
    );
  });

  it("returns null for a user with no workspace ties at all", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValue(null as never);
    db.workspaceUser.findFirst.mockResolvedValue(null as never);

    await expect(resolveWorkspaceId(db, USER)).resolves.toBeNull();
  });
});
