/**
 * Authz tests for the `agentGuidance` router (Agent principles, Phase 2):
 *
 * - `method` serves a draft only to members of a preview workspace
 *   (`METHOD_PREVIEW_WORKSPACE_SLUGS`, default `exponential`); anyone else
 *   gets NOT_FOUND "No published method yet";
 * - once published, the method goes to any authenticated principal;
 * - the procedures are `protectedProcedure`, not human-only: agent keys and
 *   agent principals reach them.
 *
 * Mocked Prisma only (CLAUDE.md "Test database safety"). Mirrors decision.test.ts.
 * The method content is the real `content/docs/method`, read through the docs loader.
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

// Flip the release manifest to "published" without touching the repo's file.
const releaseState = vi.hoisted(() => ({ published: false }));
vi.mock("~/lib/docs/method", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/docs/method")>();
  return {
    ...actual,
    readMethodRelease: (docsDir: string) => {
      const release = actual.readMethodRelease(docsDir);
      if (!release || !releaseState.published) return release;
      return { ...release, status: "published" as const, publishedAt: "2026-10-11T00:00:00.000Z" };
    },
    isMethodPublished: (docsDir: string) => releaseState.published || actual.isMethodPublished(docsDir),
  };
});

import { createMockCaller } from "~/test/trpc-helpers";

const USER_ID = "user-1";
const PREVIEW_WS = { id: "ws-exponential" };

function caller(db: DeepMockProxy<PrismaClient>, tokenType?: string) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient, tokenType });
}

/** The caller is (or is not) a direct member of the `exponential` workspace. */
function withPreviewMembership(db: DeepMockProxy<PrismaClient>, isMember: boolean) {
  db.workspace.findMany.mockResolvedValue([PREVIEW_WS] as never);
  db.workspaceUser.findUnique.mockResolvedValue(
    isMember ? ({ role: "member", workspaceId: PREVIEW_WS.id } as never) : null,
  );
  db.teamUser.findFirst.mockResolvedValue(null);
}

describe("agentGuidance.method", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    releaseState.published = false;
  });

  describe("while the method is a draft", () => {
    it("serves the draft to a member of the exponential workspace", async () => {
      withPreviewMembership(db, true);
      const method = await caller(db).agentGuidance.method();
      expect(method.status).toBe("draft");
      expect(method.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(method.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(method.canonicalSource.url).toBeNull();
      expect(method.documents[0]).toMatchObject({ id: "method", href: "/docs/method" });
      expect(db.workspace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: { in: ["exponential"] } } }),
      );
    });

    it("checks the named workspace when one is passed", async () => {
      withPreviewMembership(db, true);
      await caller(db).agentGuidance.method({ workspaceId: PREVIEW_WS.id });
      expect(db.workspace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: { in: ["exponential"] }, id: PREVIEW_WS.id } }),
      );
    });

    it("is NOT_FOUND for someone outside the preview workspaces", async () => {
      withPreviewMembership(db, false);
      await expect(caller(db).agentGuidance.method()).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "No published method yet",
      });
    });

    it("is NOT_FOUND when the named workspace is not a preview workspace", async () => {
      db.workspace.findMany.mockResolvedValue([] as never);
      await expect(
        caller(db).agentGuidance.method({ workspaceId: "ws-other" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
    });

    it("is not human-only: an agent key in the preview workspace gets the draft", async () => {
      withPreviewMembership(db, true);
      db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
      const method = await caller(db, "agent-key").agentGuidance.method();
      expect(method.status).toBe("draft");
    });
  });

  describe("once the method is published", () => {
    it("goes to any authenticated principal without a membership check", async () => {
      releaseState.published = true;
      const method = await caller(db, "agent-key").agentGuidance.method();
      expect(method).toMatchObject({
        status: "published",
        publishedAt: "2026-10-11T00:00:00.000Z",
        canonicalSource: { url: "/docs/method" },
      });
      expect(db.workspace.findMany).not.toHaveBeenCalled();
    });
  });
});
