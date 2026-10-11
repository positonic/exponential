/**
 * The context capability (`agentGuidance.context`, `getContext`,
 * `loadScopeInstructions`): a scope's AI instructions, marked as guidance and
 * assembled by the same code chat uses.
 *
 * Mocked Prisma only (CLAUDE.md "Test database safety"); router calls go
 * through `createMockCaller`, as in decision.test.ts.
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

const reportHandledErrorServer = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));

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

import { createMockCaller } from "~/test/trpc-helpers";
import { assembleScopeInstructions } from "~/server/services/ai/scopeInstructions";
import { loadScopeInstructions } from "../context";

const USER_ID = "user-1";
const WS = { id: "ws-1", slug: "acme", name: "Acme", type: "team", description: null };
const PROJECT = { id: "proj-1", name: "Launch", workspaceId: WS.id };

function caller(db: DeepMockProxy<PrismaClient>, opts: { tokenType?: string; agentRunId?: string } = {}) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient, ...opts });
}

function withWorkspace(db: DeepMockProxy<PrismaClient>, aiInstructions: string | null) {
  db.workspaceUser.findFirst.mockResolvedValue({
    userId: USER_ID,
    workspaceId: WS.id,
    role: "member",
    workspace: { ...WS, aiInstructions },
  } as never);
}

function withProject(
  db: DeepMockProxy<PrismaClient>,
  aiInstructions: string | null,
  overrides: Partial<typeof PROJECT> = {},
) {
  db.project.findFirst.mockResolvedValue({ ...PROJECT, aiInstructions, ...overrides } as never);
}

describe("agentGuidance.context", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("returns the scope, marked as guidance, with each instruction's source", async () => {
    withWorkspace(db, "  Weekly review on Fridays.  ");
    withProject(db, "Ship small.");
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context).toMatchObject({
      workspace: { id: WS.id, slug: "acme", name: "Acme" },
      project: { id: PROJECT.id, name: "Launch" },
      authority: "guidance",
      instructions: [
        { scope: "workspace", sourceId: WS.id, text: "Weekly review on Fridays." },
        { scope: "project", sourceId: PROJECT.id, text: "Ship small." },
      ],
    });
    expect(context.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Number.isNaN(Date.parse(context.generatedAt))).toBe(false);
  });

  it("assembles byte-identically to the chat assembler", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    withProject(db, "Ship small.");
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.assembled).toBe(
      assembleScopeInstructions([
        { scope: "workspace", label: "Workspace", instructions: "Weekly review on Fridays." },
        { scope: "project", label: "Project", instructions: "Ship small." },
      ]),
    );
  });

  it("omits empty scopes and assembles nothing when no scope has text", async () => {
    withWorkspace(db, "   ");
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    expect(context.instructions).toEqual([]);
    expect(context.assembled).toBeNull();
    expect(context.project).toBeNull();
  });

  it("refuses a non-member with FORBIDDEN", async () => {
    db.workspaceUser.findFirst.mockResolvedValue(null);
    await expect(caller(db).agentGuidance.context({ workspaceId: WS.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a project from another workspace with BAD_REQUEST", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    withProject(db, "Elsewhere.", { workspaceId: "ws-other" });
    await expect(
      caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("gives no project text for a spoofed project the caller can't see", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    db.project.findFirst.mockResolvedValue(null);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: "someone-elses" });
    expect(context.project).toBeNull();
    expect(context.instructions.map((i) => i.scope)).toEqual(["workspace"]);
    expect(context.assembled).not.toContain("project_instructions");
    // The project read is access-scoped, never a bare id lookup.
    const where = db.project.findFirst.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ id: "someone-elses" });
    expect(Object.keys(where).length).toBeGreaterThan(1);
  });

  it("changes revision when, and only when, an instruction text changes", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    const first = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    const again = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    expect(again.revision).toBe(first.revision);

    withWorkspace(db, "Weekly review on Thursdays.");
    const changed = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    expect(changed.revision).not.toBe(first.revision);
  });

  it("is not human-only: agent-key and agent-context callers succeed", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    await expect(
      caller(db, { tokenType: "agent-key" }).agentGuidance.context({ workspaceId: WS.id }),
    ).resolves.toMatchObject({ authority: "guidance" });
    await expect(
      caller(db, { tokenType: "agent-context", agentRunId: "run-1" }).agentGuidance.context({ workspaceId: WS.id }),
    ).resolves.toMatchObject({ authority: "guidance" });
  });
});

describe("loadScopeInstructions (the chat route's fetch)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("loads nothing when no scope is asked for", async () => {
    const loaded = await loadScopeInstructions(db as unknown as PrismaClient, { userId: USER_ID });
    expect(loaded).toEqual({ workspace: null, project: null });
    expect(db.workspaceUser.findFirst).not.toHaveBeenCalled();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it("keeps a project-only scope (no workspace) working", async () => {
    withProject(db, "Ship small.", { workspaceId: "ws-any" });
    const loaded = await loadScopeInstructions(db as unknown as PrismaClient, { userId: USER_ID, projectId: PROJECT.id });
    expect(loaded.project).toEqual({ id: PROJECT.id, name: "Launch", aiInstructions: "Ship small." });
  });

  it("checks direct membership of the workspace", async () => {
    withWorkspace(db, null);
    await loadScopeInstructions(db as unknown as PrismaClient, { userId: USER_ID, workspaceId: WS.id });
    expect(db.workspaceUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS.id, userId: USER_ID } }),
    );
  });
});
