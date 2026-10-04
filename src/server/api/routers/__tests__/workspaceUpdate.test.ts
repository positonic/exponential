/**
 * Unit tests for the `workspaceUpdate` router: who may configure the
 * copywriter and who may decide a draft, and that a draft is decided once.
 * Mocked Prisma only (CLAUDE.md "Test database safety"); generation itself is
 * covered by services/workspaceUpdates/__tests__.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

const regenerateMock = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/workspaceUpdates/generate", () => ({
  generateWorkspaceUpdate: vi.fn(),
  regenerateWorkspaceUpdate: regenerateMock,
}));

const distributeMock = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/workspaceUpdates/distribute", () => ({ distributeWorkspaceUpdate: distributeMock }));
vi.mock("~/server/services/workspaceUpdates/channels", () => ({ defaultDistributeChannels: vi.fn() }));

import { createMockCaller } from "~/test/trpc-helpers";

const WORKSPACE_ID = "ws-1";
const USER_ID = "user-1";
const UPDATE_ID = "upd-1";

type Role = "owner" | "admin" | "member" | "viewer" | null;

function mockRole(dbMock: DeepMockProxy<PrismaClient>, role: Role, reviewerIds: string[] = []) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    role ? ({ role, workspaceId: WORKSPACE_ID } as never) : null,
  );
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
  dbMock.workspaceUpdateConfig.findUnique.mockResolvedValue({ reviewerIds, enabled: false } as never);
}

function mockDraft(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspaceUpdate.findUnique.mockResolvedValue({
    id: UPDATE_ID,
    workspaceId: WORKSPACE_ID,
    status: "DRAFT",
    pageId: "page-1",
    version: 1,
  } as never);
  dbMock.knowledgePage.findUnique.mockResolvedValue({ title: "Bulk edit lands", body: "# Bulk edit lands" } as never);
}

describe("workspaceUpdate router (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    regenerateMock.mockReset();
    distributeMock.mockReset().mockResolvedValue({ kind: "partial", deliveries: {} });
  });

  describe("approve / skip — who decides a draft", () => {
    it.each([
      ["owner", []],
      ["admin", []],
      ["member", [USER_ID]],
    ] as const)("lets a %s reviewer approve", async (role, reviewers) => {
      mockRole(dbMock, role, [...reviewers]);
      mockDraft(dbMock);
      dbMock.workspaceUpdate.updateMany.mockResolvedValue({ count: 1 });

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.workspaceUpdate.approve({ updateId: UPDATE_ID, version: 1 })).resolves.toEqual({
        status: "APPROVED",
      });

      // Only the version the reviewer saw, with what they saw frozen onto the row.
      expect(dbMock.workspaceUpdate.updateMany).toHaveBeenCalledWith({
        where: { id: UPDATE_ID, status: "DRAFT", version: 1 },
        data: expect.objectContaining({
          status: "APPROVED",
          approvedById: USER_ID,
          approvedTitle: "Bulk edit lands",
          approvedBody: "# Bulk edit lands",
        }),
      });
    });

    it.each(["member", "viewer", null] as const)("hides the draft from a %s who is not a reviewer", async (role) => {
      mockRole(dbMock, role);
      mockDraft(dbMock);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.workspaceUpdate.approve({ updateId: UPDATE_ID, version: 1 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(caller.workspaceUpdate.skip({ updateId: UPDATE_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.workspaceUpdate.updateMany).not.toHaveBeenCalled();
    });

    it("distributes right after approval and reports SENT when every channel finished", async () => {
      mockRole(dbMock, "owner");
      mockDraft(dbMock);
      dbMock.workspaceUpdate.updateMany.mockResolvedValue({ count: 1 });
      distributeMock.mockResolvedValue({ kind: "sent", deliveries: {} });

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.workspaceUpdate.approve({ updateId: UPDATE_ID, version: 1 })).resolves.toEqual({ status: "SENT" });
      expect(distributeMock).toHaveBeenCalledWith(dbMock, UPDATE_ID, undefined);
    });

    it("keeps the approval when distribution throws (the sweep retries)", async () => {
      mockRole(dbMock, "owner");
      mockDraft(dbMock);
      dbMock.workspaceUpdate.updateMany.mockResolvedValue({ count: 1 });
      distributeMock.mockRejectedValue(new Error("postmark down"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.workspaceUpdate.approve({ updateId: UPDATE_ID, version: 1 })).resolves.toEqual({ status: "APPROVED" });
    });

    it("refuses to approve a version the reviewer did not see (a rewrite landed)", async () => {
      mockRole(dbMock, "owner");
      mockDraft(dbMock);
      dbMock.workspaceUpdate.updateMany.mockResolvedValue({ count: 0 });

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.workspaceUpdate.approve({ updateId: UPDATE_ID, version: 1 })).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("decides a draft only once (double click, or approve racing skip)", async () => {
      mockRole(dbMock, "owner");
      mockDraft(dbMock);
      dbMock.workspaceUpdate.updateMany.mockResolvedValue({ count: 0 });

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(caller.workspaceUpdate.skip({ updateId: UPDATE_ID })).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("regenerate", () => {
    it("maps a lost race to CONFLICT", async () => {
      mockRole(dbMock, "owner");
      mockDraft(dbMock);
      regenerateMock.mockResolvedValue({ kind: "conflict" });

      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.workspaceUpdate.regenerate({ updateId: UPDATE_ID, feedback: "shorter" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(regenerateMock).toHaveBeenCalledWith(
        dbMock,
        { updateId: UPDATE_ID, feedback: "shorter", actorUserId: USER_ID },
        expect.anything(),
      );
    });
  });

  describe("updateConfig — owners and admins only", () => {
    it("forbids a member", async () => {
      mockRole(dbMock, "member");
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.workspaceUpdate.updateConfig({ workspaceId: WORKSPACE_ID, enabled: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("stamps enabledAt when switching on, and rejects non-member reviewers", async () => {
      mockRole(dbMock, "admin");
      dbMock.workspaceUpdateConfig.findUnique.mockResolvedValue({ enabled: false } as never);
      dbMock.workspaceUpdateConfig.upsert.mockResolvedValue({} as never);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });

      await caller.workspaceUpdate.updateConfig({ workspaceId: WORKSPACE_ID, enabled: true, timezone: "Europe/Berlin" });
      const upsert = dbMock.workspaceUpdateConfig.upsert.mock.calls[0]![0];
      expect(upsert.update).toMatchObject({ enabled: true, timezone: "Europe/Berlin", enabledAt: expect.any(Date) });

      dbMock.workspaceUser.count.mockResolvedValue(1);
      await expect(
        caller.workspaceUpdate.updateConfig({ workspaceId: WORKSPACE_ID, reviewerIds: ["u-a", "u-stranger"] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects an unknown time zone", async () => {
      mockRole(dbMock, "owner");
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.workspaceUpdate.updateConfig({ workspaceId: WORKSPACE_ID, timezone: "Mars/Olympus" }),
      ).rejects.toThrow();
    });
  });
});
