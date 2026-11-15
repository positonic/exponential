/**
 * Role gate on view and list mutations: workspace *membership* is not
 * permission to write. Both routers used to gate their mutations on "has a
 * WorkspaceUser row", which let a read-only `viewer` create, change and delete
 * views and lists and move actions on and off lists. Each block checks that a
 * `viewer` gets FORBIDDEN and writes nothing, while a `member` goes through
 * to the write.
 *
 * Mocked Prisma (`vitest-mock-extended`), same harness as the product
 * plugin's `writeRole.test.ts`.
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
    constructor(_opts?: unknown) {
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

import { createMockCaller } from "~/test/trpc-helpers";

const callerId = "user-1";
const workspaceId = "ws-1";

type Role = "owner" | "admin" | "member" | "viewer";

/** The caller's direct WorkspaceUser role (no team-based fallback). */
function stubRole(dbMock: DeepMockProxy<PrismaClient>, role: Role) {
  dbMock.workspaceUser.findUnique.mockResolvedValue({ role, workspaceId } as never);
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
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
    expect(opts.write(dbMock).mock.calls).toHaveLength(1);
  });
}

const VIEW = { id: "view-1", workspaceId, isSystem: false, createdById: callerId };
const LIST = { id: "list-1", workspaceId, createdById: callerId };

describe("view.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.view.findUnique.mockResolvedValue(null);
      db.view.create.mockResolvedValue({ id: "view-new" } as never);
    },
    act: (caller) => caller.view.create({ workspaceId, name: "Mine", slug: "mine" }),
    write: (db) => db.view.create,
  });
});

describe("view.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.view.findUnique.mockResolvedValue(VIEW as never);
      db.view.update.mockResolvedValue(VIEW as never);
    },
    act: (caller) => caller.view.update({ id: VIEW.id, name: "Renamed" }),
    write: (db) => db.view.update,
  });
});

describe("view.delete role gate (mocked)", () => {
  // The caller created this view, which used to be enough to delete it.
  roleGateCases({
    arrange: (db) => {
      db.view.findUnique.mockResolvedValue(VIEW as never);
      db.view.delete.mockResolvedValue(VIEW as never);
    },
    act: (caller) => caller.view.delete({ id: VIEW.id }),
    write: (db) => db.view.delete,
  });

  it("still refuses a member who neither created the view nor administers the workspace", async () => {
    const dbMock = getDbMock();
    dbMock.view.findUnique.mockResolvedValue({ ...VIEW, createdById: "someone-else" } as never);
    stubRole(dbMock, "member");

    await expectForbidden(createMockCaller({ userId: callerId, db: dbMock }).view.delete({ id: VIEW.id }));
    expect(dbMock.view.delete.mock.calls).toHaveLength(0);
  });
});

describe("list.create role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.list.findUnique.mockResolvedValue(null);
      db.list.create.mockResolvedValue({ id: "list-new" } as never);
    },
    act: (caller) => caller.list.create({ workspaceId, name: "Sprint 1", slug: "sprint-1" }),
    write: (db) => db.list.create,
  });
});

describe("list.update role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.list.findUnique.mockResolvedValue(LIST as never);
      db.list.update.mockResolvedValue(LIST as never);
    },
    act: (caller) => caller.list.update({ id: LIST.id, name: "Renamed" }),
    write: (db) => db.list.update,
  });
});

describe("list.delete role gate (mocked)", () => {
  // The caller created this list, which used to be enough to delete it.
  roleGateCases({
    arrange: (db) => {
      db.list.findUnique.mockResolvedValue(LIST as never);
      db.list.delete.mockResolvedValue(LIST as never);
    },
    act: (caller) => caller.list.delete({ id: LIST.id }),
    write: (db) => db.list.delete,
  });
});

describe("list.addAction role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.action.findUnique.mockResolvedValue({ workspaceId, project: null } as never);
      db.list.findUnique.mockResolvedValue({ id: LIST.id, workspaceId } as never);
      db.actionList.create.mockResolvedValue({ actionId: "action-1", listId: LIST.id } as never);
    },
    act: (caller) => caller.list.addAction({ listId: LIST.id, actionId: "action-1" }),
    write: (db) => db.actionList.create,
  });
});

describe("list.removeAction role gate (mocked)", () => {
  roleGateCases({
    arrange: (db) => {
      db.list.findUnique.mockResolvedValue(LIST as never);
      db.actionList.delete.mockResolvedValue({ actionId: "action-1", listId: LIST.id } as never);
    },
    act: (caller) => caller.list.removeAction({ listId: LIST.id, actionId: "action-1" }),
    write: (db) => db.actionList.delete,
  });
});

describe("reading views and lists (mocked)", () => {
  it("still lets a viewer list the workspace's views and lists", async () => {
    const dbMock = getDbMock();
    mockReset(dbMock);
    stubRole(dbMock, "viewer");
    dbMock.view.findMany.mockResolvedValue([VIEW] as never);
    dbMock.list.findMany.mockResolvedValue([LIST] as never);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    await expect(caller.view.list({ workspaceId })).resolves.toHaveLength(1);
    await expect(caller.list.list({ workspaceId })).resolves.toHaveLength(1);
  });
});
