/**
 * agentRun.listForAction carries the derived `waitingForRunner` flag the pill
 * renders as "Waiting for a runner" (Agent PRD V2): true only for a LOCAL_CLI
 * run QUEUED for ten minutes; a fresh LOCAL_CLI run and any MASTRA run are
 * plain "Queued". Mocked Prisma.
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
vi.mock("~/server/services/access", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActionAccess: vi.fn().mockResolvedValue({ canView: true }),
  canViewAction: () => true,
}));

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

const agent = {
  id: "agent-1",
  name: "Aria",
  ownerId: "owner-1",
  shadowUser: { id: "shadow-1", name: "Aria", image: null },
  assistant: { emoji: null },
};
const base = {
  actionId: "action-1",
  startedAt: null,
  finishedAt: null,
  lastEventAt: null,
  toolCallCount: 0,
  summary: null,
  readyToClose: false,
  error: null,
  requestedById: "owner-1",
  agent,
};
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

describe("agentRun.listForAction · waitingForRunner", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.agentRunEvent.findMany.mockResolvedValue([] as never);
  });

  it("flags a LOCAL_CLI run QUEUED for ten minutes, and nothing else", async () => {
    db.agentRun.findMany.mockResolvedValue([
      { ...base, id: "stale-local", status: "QUEUED", executor: "LOCAL_CLI", createdAt: minutesAgo(11) },
      { ...base, id: "fresh-local", status: "QUEUED", executor: "LOCAL_CLI", createdAt: minutesAgo(2) },
      { ...base, id: "stale-hosted", status: "QUEUED", executor: "MASTRA", createdAt: minutesAgo(30) },
      { ...base, id: "claimed", status: "RUNNING", executor: "LOCAL_CLI", createdAt: minutesAgo(30), startedAt: minutesAgo(1) },
    ] as never);

    const runs = await createMockCaller({ userId: "viewer", db }).agentRun.listForAction({ actionId: "action-1" });

    expect(runs.map((r) => [r.id, r.waitingForRunner])).toEqual([
      ["stale-local", true],
      ["fresh-local", false],
      ["stale-hosted", false],
      ["claimed", false],
    ]);
    // The flag is presentation only: the row is still QUEUED and claimable.
    expect(runs[0]?.status).toBe("QUEUED");
  });
});
