/**
 * Role gate on product-plugin mutations: workspace *membership* is not
 * permission to write. Every router here used to gate its mutations on
 * "has a WorkspaceUser row", which let a read-only `viewer` update, delete,
 * comment, and reconfigure the Notion sync. Each block below takes one
 * representative mutation per router and checks that a `viewer` gets
 * FORBIDDEN while a `member` goes through to the write.
 *
 * Mocked Prisma (`vitest-mock-extended`), same harness as `featureMove.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
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

vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendAssignmentNotifications: vi.fn().mockResolvedValue(undefined),
  sendFeatureMentionNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/server/services/notifications/emit/mentionAdapters", () => ({
  emitFeatureCommentMention: vi.fn().mockResolvedValue(undefined),
  emitTicketCommentMention: vi.fn().mockResolvedValue(undefined),
  emitInsightCommentMention: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";
const productId = "prod-1";

type Role = "owner" | "admin" | "member" | "viewer";

/** The caller's direct WorkspaceUser role (no team-based fallback). */
function stubRole(dbMock: DeepMockProxy<PrismaClient>, role: Role) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    { role, workspaceId } as never,
  );
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

function stubProduct(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.product.findUnique.mockResolvedValue(
    { id: productId, workspaceId, slug: "p" } as never,
  );
}

async function expectForbidden(p: Promise<unknown>) {
  let code: string | undefined;
  try {
    await p;
  } catch (e) {
    code = e instanceof TRPCError ? e.code : "NOT_TRPC";
  }
  expect(code).toBe("FORBIDDEN");
}

/**
 * Shared shape for every block: `arrange` stubs the entity lookup and the
 * write; `act` fires the mutation; `write` is the Prisma method that must
 * stay untouched for a viewer and be hit for a member.
 */
function roleGateCases(opts: {
  arrange: (db: DeepMockProxy<PrismaClient>) => void;
  act: (caller: ReturnType<typeof createMockCaller>) => Promise<unknown>;
  write: (db: DeepMockProxy<PrismaClient>) => { mock: { calls: unknown[] } };
}) {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.$transaction.mockImplementation(async (cb: any) =>
      typeof cb === "function" ? cb(dbMock) : Promise.all(cb),
    );
    opts.arrange(dbMock);
  });

  it("refuses a viewer with FORBIDDEN and writes nothing", async () => {
    stubRole(dbMock, "viewer");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expectForbidden(opts.act(caller));
    expect(opts.write(dbMock).mock.calls).toHaveLength(0);
  });

  it("lets a member through to the write", async () => {
    stubRole(dbMock, "member");
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await opts.act(caller);
    expect(opts.write(dbMock).mock.calls.length).toBeGreaterThan(0);
  });
}

describe("feature.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.feature.findUnique.mockResolvedValue({
        id: "feat-1",
        name: "F",
        productId,
        product: { workspaceId },
      } as never);
      db.feature.update.mockResolvedValue({ id: "feat-1" } as never);
    },
    act: (c) => c.product.feature.update({ id: "feat-1", name: "Renamed" }),
    write: (db) => db.feature.update,
  });
});

describe("featureComment.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.feature.findUnique.mockResolvedValue({
        id: "feat-1",
        name: "F",
        productId,
        product: { workspaceId },
      } as never);
      db.featureComment.create.mockResolvedValue({
        id: "c-1",
        featureId: "feat-1",
      } as never);
    },
    act: (c) =>
      c.product.featureComment.create({ featureId: "feat-1", body: "hi" }),
    write: (db) => db.featureComment.create,
  });
});

describe("ticket.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      stubProduct(db);
      db.ticket.findUnique.mockResolvedValue({
        id: "ticket-1",
        productId,
        status: "BACKLOG",
        product: { workspaceId },
      } as never);
      db.ticket.update.mockResolvedValue({ id: "ticket-1" } as never);
    },
    act: (c) => c.product.ticket.update({ id: "ticket-1", assigneeId: null }),
    write: (db) => db.ticket.update,
  });
});

describe("ticketSync.setEnabled role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      stubProduct(db);
      db.ticketSyncConfig.update.mockResolvedValue({
        id: "cfg-1",
        enabled: true,
      } as never);
    },
    act: (c) => c.product.ticketSync.setEnabled({ productId, enabled: true }),
    write: (db) => db.ticketSyncConfig.update,
  });
});

describe("insight.park role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.insight.findUnique.mockResolvedValue({
        id: "insight-1",
        productId,
        product: { workspaceId },
      } as never);
      db.insight.update.mockResolvedValue({ id: "insight-1" } as never);
    },
    act: (c) => c.product.insight.park({ id: "insight-1", reason: "later" }),
    write: (db) => db.insight.update,
  });
});

describe("product.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      stubProduct(db);
      db.product.update.mockResolvedValue({ id: productId } as never);
    },
    act: (c) => c.product.product.update({ id: productId, name: "Renamed" }),
    write: (db) => db.product.update,
  });
});

describe("cycle.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.list.findUnique.mockResolvedValue({
        id: "cycle-1",
        workspaceId,
        productId,
        listType: "SPRINT",
      } as never);
      db.list.update.mockResolvedValue({ id: "cycle-1" } as never);
    },
    act: (c) => c.product.cycle.update({ id: "cycle-1", name: "Sprint 2" }),
    write: (db) => db.list.update,
  });
});

describe("research.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.research.findUnique.mockResolvedValue({
        id: "res-1",
        productId,
        product: { workspaceId },
      } as never);
      db.research.update.mockResolvedValue({ id: "res-1" } as never);
    },
    act: (c) => c.product.research.update({ id: "res-1", title: "Renamed" }),
    write: (db) => db.research.update,
  });
});

describe("retrospective.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.retrospective.findUnique.mockResolvedValue({
        id: "retro-1",
        workspaceId,
      } as never);
      db.retrospective.update.mockResolvedValue({ id: "retro-1" } as never);
    },
    act: (c) =>
      c.product.retrospective.update({ id: "retro-1", title: "Renamed" }),
    write: (db) => db.retrospective.update,
  });
});
