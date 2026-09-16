/**
 * Unit tests for the anchored-comment thread procedures on the ticket router
 * (ADR-0024, mirrors featureComment): threaded replies stay one level deep and
 * inherit the thread, every procedure gates on the ticket's workspace, and
 * resolve/unresolve only touch the thread root.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()`; mirrors the mock
 * layout from `ticket.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before regular
// top-level statements. Mirrors ticket.test.ts.
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

// ── Stub side-effect-heavy modules used by sibling routers ───────────
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
  sendFeatureMentionNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/notifications/emit/mentionAdapters", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  emitTicketCommentMention: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const ticketId = "ticket-1";

function stubTicketAccess(dbMock: DeepMockProxy<PrismaClient>, isMember = true) {
  // loadTicketWithAccess's lookup (only the fields the gate reads matter here).
  dbMock.ticket.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: ticketId, productId: "prod-1", body: null, docVersion: 0, product: { workspaceId } } as any,
  );
  // assertWorkspaceMember's membership probe.
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isMember ? ({ role: "member", workspaceId } as any) : null,
  );
}

describe("ticket router — anchored comment threads (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubTicketAccess(dbMock);
    dbMock.ticketComment.create.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "new-comment", ticketId } as any,
    );
  });

  it("addComment stores the thread anchor and quoted text", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.ticket.addComment({
      ticketId,
      content: "Is this right?",
      threadId: "thread-1",
      quotedText: "indicator",
    });

    expect(dbMock.ticketComment.create.mock.calls[0]?.[0]?.data).toMatchObject({
      ticketId,
      authorId: callerId,
      content: "Is this right?",
      threadId: "thread-1",
      quotedText: "indicator",
    });
  });

  it("replyComment hangs a reply-to-a-reply off the thread root", async () => {
    dbMock.ticketComment.findUnique.mockResolvedValue(
      // The parent is itself a reply to root-1.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ticketId, threadId: "thread-1", parentId: "root-1" } as any,
    );
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.ticket.replyComment({ parentId: "reply-1", content: "Agreed" });

    expect(dbMock.ticketComment.create.mock.calls[0]?.[0]?.data).toMatchObject({
      ticketId,
      authorId: callerId,
      content: "Agreed",
      threadId: "thread-1",
      parentId: "root-1",
    });
  });

  it("replyComment on a root comment uses the root as parent", async () => {
    dbMock.ticketComment.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ticketId, threadId: "thread-1", parentId: null } as any,
    );
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.ticket.replyComment({ parentId: "root-1", content: "Agreed" });

    expect(dbMock.ticketComment.create.mock.calls[0]?.[0]?.data).toMatchObject({
      parentId: "root-1",
      threadId: "thread-1",
    });
  });

  it("replyComment rejects an unknown parent without writing", async () => {
    dbMock.ticketComment.findUnique.mockResolvedValue(null);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.product.ticket.replyComment({ parentId: "missing", content: "Hi" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMock.ticketComment.create).not.toHaveBeenCalled();
  });

  it("replyComment gates on the parent ticket's workspace", async () => {
    stubTicketAccess(dbMock, false);
    dbMock.ticketComment.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ticketId, threadId: "thread-1", parentId: null } as any,
    );
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.product.ticket.replyComment({ parentId: "root-1", content: "Hi" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.ticketComment.create).not.toHaveBeenCalled();
  });

  it("resolve and unresolve touch only the thread root on that ticket", async () => {
    dbMock.ticketComment.updateMany.mockResolvedValue({ count: 1 });
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await caller.product.ticket.resolveCommentThread({ ticketId, threadId: "thread-1" });
    await caller.product.ticket.unresolveCommentThread({ ticketId, threadId: "thread-1" });

    const [resolveArgs, unresolveArgs] = dbMock.ticketComment.updateMany.mock.calls.map(
      (c) => c[0],
    );
    const rootWhere = { ticketId, threadId: "thread-1", parentId: null };
    expect(resolveArgs?.where).toEqual(rootWhere);
    expect(resolveArgs?.data).toMatchObject({ resolvedAt: expect.any(Date) as Date });
    expect(unresolveArgs?.where).toEqual(rootWhere);
    expect(unresolveArgs?.data).toEqual({ resolvedAt: null });
  });

  it("resolve is refused for non-members", async () => {
    stubTicketAccess(dbMock, false);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(
      caller.product.ticket.resolveCommentThread({ ticketId, threadId: "thread-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.ticketComment.updateMany).not.toHaveBeenCalled();
  });
});
