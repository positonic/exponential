/**
 * agentRun.cancel (ADR-0067, Agent PRD D7): edit access on the action,
 * QUEUED → CANCELLED, RUNNING → CANCELLED as a flag, nothing for a finished
 * run or a stranger. Mocked Prisma.
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

describe("agentRun.cancel", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.$transaction.mockImplementation(((cb: (tx: unknown) => unknown) => cb(db)) as never);
    db.agentRunEvent.aggregate.mockResolvedValue({ _max: { seq: 0 } } as never);
    db.agentRunEvent.create.mockResolvedValue({ id: "ev", seq: 1 } as never);
    db.agentRun.update.mockResolvedValue({} as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("cancels a QUEUED run the caller may edit and logs a status event", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "QUEUED" } as never);
    const result = await createMockCaller({ userId: "editor", db }).agentRun.cancel({ runId: "run-1" });
    expect(result).toEqual({ cancelled: true, was: "QUEUED" });
    // The lookup is scoped by the live set and by edit access on the action.
    const where = (db.agentRun.findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ id: "run-1", status: { in: ["QUEUED", "RUNNING"] } });
    expect(where).toHaveProperty("action");
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "run-1", status: "QUEUED" },
      data: { status: "CANCELLED" },
    });
    expect(db.agentRunEvent.create.mock.calls[0]?.[0]).toMatchObject({
      data: { kind: "status", payload: { status: "CANCELLED", was: "QUEUED" } },
    });
  });

  it("a RUNNING run is cancelled as a flag only — the dispatcher discards late results", async () => {
    db.agentRun.findFirst.mockResolvedValue({ id: "run-1", status: "RUNNING" } as never);
    const result = await createMockCaller({ userId: "editor", db }).agentRun.cancel({ runId: "run-1" });
    expect(result).toEqual({ cancelled: true, was: "RUNNING" });
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: "run-1", status: "RUNNING" } });
  });

  it("is NOT_FOUND for a finished run or an action the caller cannot edit", async () => {
    db.agentRun.findFirst.mockResolvedValue(null as never);
    await expect(createMockCaller({ userId: "stranger", db }).agentRun.cancel({ runId: "run-1" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.agentRun.updateMany).not.toHaveBeenCalled();
  });
});
