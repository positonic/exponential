/**
 * `externalAgent.update` — an agent's description is its fallback Remit
 * (ADR-0068 §3), editable after creation by the owner and nobody else.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
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

import { createMockCaller } from "~/test/trpc-helpers";

const OWNER_ID = "owner-1";
const AGENT_ID = "agent-1";
const SHADOW_ID = "shadow-1";

function caller(db: DeepMockProxy<PrismaClient>, opts: { tokenType?: string } = {}) {
  return createMockCaller({ userId: OWNER_ID, db: db as unknown as PrismaClient, tokenType: opts.tokenType });
}

/** The owner is a human (humanOnlyProcedure) and owns a plain External agent. */
function arrangeOwnedAgent(db: DeepMockProxy<PrismaClient>, opts: { assistant?: boolean } = {}) {
  db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
  db.externalAgent.findFirst.mockResolvedValue({
    id: AGENT_ID,
    ownerId: OWNER_ID,
    shadowUserId: SHADOW_ID,
    shadowUser: { id: SHADOW_ID, image: null },
    assistant: opts.assistant ? { id: "assistant-1" } : null,
  } as never);
  db.externalAgent.update.mockImplementation(((args: { data: { description: string | null } }) =>
    Promise.resolve({ id: AGENT_ID, description: args.data.description })) as never);
}

describe("externalAgent.update", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("the owner edits the description, trimmed", async () => {
    arrangeOwnedAgent(db);

    const result = await caller(db).externalAgent.update({
      agentId: AGENT_ID,
      description: "  Triages inbound bugs and drafts the first reply.  ",
    });

    // Owner-scoped lookup: someone else's agent id simply does not resolve.
    expect(db.externalAgent.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: AGENT_ID, ownerId: OWNER_ID },
    });
    expect(db.externalAgent.update).toHaveBeenCalledWith({
      where: { id: AGENT_ID },
      data: { description: "Triages inbound bugs and drafts the first reply." },
      select: { id: true, description: true },
    });
    expect(result).toEqual({ id: AGENT_ID, description: "Triages inbound bugs and drafts the first reply." });
  });

  it("clears the description with null, and treats blank as null", async () => {
    arrangeOwnedAgent(db);

    await caller(db).externalAgent.update({ agentId: AGENT_ID, description: null });
    await caller(db).externalAgent.update({ agentId: AGENT_ID, description: "   " });

    expect(db.externalAgent.update.mock.calls.map((c) => c[0].data)).toEqual([
      { description: null },
      { description: null },
    ]);
  });

  it("a non-owner gets NOT_FOUND, nothing written", async () => {
    db.user.findUnique.mockResolvedValue({ isAgent: false } as never);
    db.externalAgent.findFirst.mockResolvedValue(null);

    await expect(
      caller(db).externalAgent.update({ agentId: AGENT_ID, description: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.externalAgent.update).not.toHaveBeenCalled();
  });

  it("an Assistant's principal is edited from Settings → Assistant instead", async () => {
    arrangeOwnedAgent(db, { assistant: true });

    await expect(
      caller(db).externalAgent.update({ agentId: AGENT_ID, description: "x" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.externalAgent.update).not.toHaveBeenCalled();
  });

  it("refuses an agent principal (isAgent: true), nothing written", async () => {
    arrangeOwnedAgent(db);
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);

    await expect(
      caller(db).externalAgent.update({ agentId: AGENT_ID, description: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.externalAgent.findFirst).not.toHaveBeenCalled();
    expect(db.externalAgent.update).not.toHaveBeenCalled();
  });

  it("refuses an agent-key token before any lookup", async () => {
    arrangeOwnedAgent(db);

    await expect(
      caller(db, { tokenType: "agent-key" }).externalAgent.update({ agentId: AGENT_ID, description: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.externalAgent.update).not.toHaveBeenCalled();
  });
});
