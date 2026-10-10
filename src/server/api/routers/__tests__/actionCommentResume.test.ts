/**
 * Owner reply resumes a waiting run (ADR-0067, Agent PRD D6): a human comment
 * on an action whose latest run by the author's Assistant is WAITING_ON_OWNER
 * enqueues a resume run (predecessorId + wakeCommentId) and kicks the
 * dispatcher; anyone else's comment, or an Assistant's own comment through
 * the run tool, resumes nothing. Mocked Prisma.
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
vi.mock("openai", () => ({ default: class { constructor(_o?: unknown) { /* noop */ } } }));
vi.mock("next-auth", () => ({ default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
const afterMock = vi.fn((cb: () => unknown) => void cb());
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (cb: () => unknown) => afterMock(cb),
}));
const dispatchMock = vi.fn().mockResolvedValue(undefined);
vi.mock("~/server/services/agentRuns/dispatch", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  triggerDispatch: (...args: unknown[]) => dispatchMock(...args),
}));
vi.mock("~/server/services/notifications/emit/mentionAdapters", () => ({ emitActionCommentMention: vi.fn().mockResolvedValue(undefined) }));
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity: vi.fn().mockResolvedValue(true) }));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy({}, { get(_t, prop) { return (getDbMock() as unknown as Record<string | symbol, unknown>)[prop as string]; } });
  return { db: proxy };
});

import { createMockCaller } from "~/test/trpc-helpers";

const ACTION = "action-1";
const OWNER = "owner-1";

describe("actionComment.addComment resumes a waiting run", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    afterMock.mockClear();
    dispatchMock.mockClear();
    // View access: the commenter created the action.
    db.action.findUnique.mockResolvedValue({ id: ACTION, createdById: OWNER, projectId: null, teamId: null, workspaceId: "ws-1", assignees: [], project: null } as never);
    db.action.findFirst.mockResolvedValue({ id: ACTION } as never);
    db.actionComment.create.mockResolvedValue({ id: "c-9", author: { id: OWNER, name: "James", image: null } } as never);
    db.agentRun.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "run-2", agentId: args.data.agentId, executor: args.data.executor })) as never);
  });

  it("the owner's reply on a WAITING_ON_OWNER action starts a resume run with the thread so far and kicks the dispatcher", async () => {
    db.externalAgent.findMany.mockResolvedValue([{ id: "agent-1", executor: "MASTRA" }] as never);
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "WAITING_ON_OWNER" } as never);

    await createMockCaller({ userId: OWNER, db }).actionComment.addComment({ actionId: ACTION, content: "19 Nov works." });

    expect(db.externalAgent.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { ownerId: OWNER, assistant: { isNot: null } } });
    expect(db.agentRun.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actionId: ACTION, agentId: "agent-1", requestedById: OWNER, predecessorId: "run-1", wakeCommentId: "c-9" },
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("a teammate's comment resumes nothing", async () => {
    db.externalAgent.findMany.mockResolvedValue([] as never);
    db.action.findUnique.mockResolvedValue({ id: ACTION, createdById: "teammate", projectId: null, teamId: null, workspaceId: "ws-1", assignees: [], project: null } as never);
    db.actionComment.create.mockResolvedValue({ id: "c-10", author: { id: "teammate", name: "Andi", image: null } } as never);

    await createMockCaller({ userId: "teammate", db }).actionComment.addComment({ actionId: ACTION, content: "fyi" });

    expect(db.agentRun.create).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("the owner's comment when the latest run already finished resumes nothing", async () => {
    db.externalAgent.findMany.mockResolvedValue([{ id: "agent-1", executor: "MASTRA" }] as never);
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "SUCCEEDED" } as never);

    await createMockCaller({ userId: OWNER, db }).actionComment.addComment({ actionId: ACTION, content: "thanks" });

    expect(db.agentRun.create).not.toHaveBeenCalled();
  });
});
