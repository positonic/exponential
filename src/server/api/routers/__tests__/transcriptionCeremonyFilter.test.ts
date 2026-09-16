/**
 * `transcription.getAllTranscriptions` ceremony filter (ADR-0059): the
 * optional `ceremonyId` narrows the list to meetings attached to an
 * occurrence of that ceremony, on top of the visibility rule. Mocked Prisma.
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
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));

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

const USER_ID = "user-1";

describe("transcription.getAllTranscriptions ceremony filter", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.transcriptionSession.findMany.mockResolvedValue([]);
  });

  it("adds an occurrence.ceremonyId clause when ceremonyId is given, alongside the visibility rule", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    await caller.transcription.getAllTranscriptions({ workspaceId: "ws-1", ceremonyId: "cer-1" });

    const args = db.transcriptionSession.findMany.mock.calls[0]![0]!;
    const and = (args.where as { AND: unknown[] }).AND;
    expect(and).toContainEqual({ occurrence: { ceremonyId: "cer-1" } });
    expect(and[0]).toHaveProperty("OR"); // buildTranscriptionAccessWhere stays first
    expect((args.include as { occurrence?: unknown }).occurrence).toBeDefined();
  });

  it("adds no ceremony clause without ceremonyId", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    await caller.transcription.getAllTranscriptions({ workspaceId: "ws-1" });
    const and = (db.transcriptionSession.findMany.mock.calls[0]![0]!.where as { AND: unknown[] }).AND;
    expect(and.some((f) => typeof f === "object" && f !== null && "occurrence" in f)).toBe(false);
  });
});
