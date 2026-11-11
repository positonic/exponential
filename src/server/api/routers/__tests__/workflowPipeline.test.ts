/**
 * Authorization on the workflowPipeline router. Every procedure used to check
 * only that the caller was signed in, so any user could list every tenant's
 * runs and read, edit, delete or execute any workflow definition by id.
 *
 * A definition belongs to its creator inside its workspace (the scope
 * `listDefinitions` already used). Reads need workspace membership; edits and
 * runs need a write role.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before
// regular top-level statements. Mirrors action.test.ts.
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

// ── Stub heavy/IO modules pulled in by the wider router tree ─────────
vi.mock("openai", () => ({
  default: class MockOpenAI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: () => null,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
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

// ── dbMock plumbing ─────────────────────────────────────────────────
const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = {
  current: null,
};
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) {
    dbHolder.current = mockDeep<PrismaClient>();
  }
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


const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));
vi.mock("~/server/services/workflows/WorkflowEngine", () => ({
  WorkflowEngine: class {
    execute = executeMock;
  },
}));

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "caller-1";
const workspaceId = "ws-1";

function ownDefinition() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { createdById: callerId, workspaceId } as any;
}

function othersDefinition() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { createdById: "someone-else", workspaceId: "ws-other" } as any;
}

function membership(role: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { role, workspaceId } as any;
}

describe("workflowPipeline router authorization", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  let caller: ReturnType<typeof createMockCaller>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    executeMock.mockReset();
    caller = createMockCaller({ userId: callerId, db: dbMock });
  });

  describe("someone else's definition is NOT_FOUND", () => {
    beforeEach(() => {
      dbMock.workflowDefinition.findUnique.mockResolvedValue(othersDefinition());
    });

    it("getDefinition", async () => {
      await expect(caller.workflowPipeline.getDefinition({ id: "d1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(dbMock.workflowDefinition.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("updateDefinition", async () => {
      await expect(
        caller.workflowPipeline.updateDefinition({ id: "d1", name: "pwned" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(dbMock.workflowDefinition.update).not.toHaveBeenCalled();
    });

    it("deleteDefinition", async () => {
      await expect(caller.workflowPipeline.deleteDefinition({ id: "d1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(dbMock.workflowDefinition.delete).not.toHaveBeenCalled();
    });

    it("execute", async () => {
      await expect(
        caller.workflowPipeline.execute({ definitionId: "d1" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(executeMock).not.toHaveBeenCalled();
    });

    it("getRun", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.workflowPipelineRun.findUnique.mockResolvedValue({ definitionId: "d1" } as any);
      await expect(caller.workflowPipeline.getRun({ id: "run-1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(dbMock.workflowPipelineRun.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe("own definition", () => {
    beforeEach(() => {
      dbMock.workflowDefinition.findUnique.mockResolvedValue(ownDefinition());
    });

    it("is refused once the creator has left the workspace", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);
      dbMock.teamUser.findFirst.mockResolvedValue(null);
      await expect(caller.workflowPipeline.getDefinition({ id: "d1" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("can be read by a viewer but not edited, deleted or run", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(membership("viewer"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbMock.workflowDefinition.findUniqueOrThrow.mockResolvedValue({ id: "d1" } as any);

      await expect(caller.workflowPipeline.getDefinition({ id: "d1" })).resolves.toMatchObject({
        id: "d1",
      });
      await expect(
        caller.workflowPipeline.updateDefinition({ id: "d1", name: "x" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.workflowPipeline.deleteDefinition({ id: "d1" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.workflowPipeline.execute({ definitionId: "d1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(executeMock).not.toHaveBeenCalled();
    });

    it("can be run by a member, as the caller", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(membership("member"));
      executeMock.mockResolvedValue({ id: "run-1" });

      await caller.workflowPipeline.execute({ definitionId: "d1" });
      expect(executeMock).toHaveBeenCalledWith("d1", callerId, undefined);
    });
  });

  it("createDefinition refuses a workspace the caller doesn't belong to", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    dbMock.teamUser.findFirst.mockResolvedValue(null);

    await expect(
      caller.workflowPipeline.createDefinition({
        workspaceId: "ws-other",
        templateSlug: "content-generation",
        name: "x",
        config: {},
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.workflowDefinition.create).not.toHaveBeenCalled();
  });

  describe("listRuns", () => {
    beforeEach(() => {
      dbMock.workflowPipelineRun.findMany.mockResolvedValue([]);
    });

    it("with no filters lists only the caller's own runs", async () => {
      // The home dashboard calls it like this.
      await caller.workflowPipeline.listRuns({ definitionId: "", limit: 5 });

      const where = dbMock.workflowPipelineRun.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({ definition: { createdById: callerId } });
    });

    it("refuses a workspace the caller doesn't belong to", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(null);
      dbMock.teamUser.findFirst.mockResolvedValue(null);

      await expect(
        caller.workflowPipeline.listRuns({ workspaceId: "ws-other" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dbMock.workflowPipelineRun.findMany).not.toHaveBeenCalled();
    });

    it("scopes a workspace filter to the caller's own definitions", async () => {
      dbMock.workspaceUser.findUnique.mockResolvedValue(membership("viewer"));

      await caller.workflowPipeline.listRuns({ workspaceId });

      const where = dbMock.workflowPipelineRun.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({
        definition: { createdById: callerId, workspaceId },
      });
    });
  });
});
