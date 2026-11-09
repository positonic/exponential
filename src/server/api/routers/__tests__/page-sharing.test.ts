/**
 * Who may share a Page and how far (ADR-0080): anyone who can edit adds
 * people; a non-owner changes or removes only the grants they added and may
 * not make a workspace Viewer an editor; only the owner restricts a page or
 * publishes a restricted one.
 *
 * Mocked Prisma backed by one project-less page and an in-memory grant table.
 * Who-sees-what against a real DB lives in page.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

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
vi.mock("~/server/utils/reportHandledErrorServer", () => ({
  reportHandledErrorServer: vi.fn(),
}));
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({
  emitNotification: vi.fn(() => Promise.resolve()),
}));
vi.mock("~/server/services/notifications/EmailNotificationService", () => ({
  sendPageMentionNotifications: vi.fn(),
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

import { emitNotification } from "~/server/services/notifications/emit/emitNotification";

const PAGE_ID = "page-1";
const WORKSPACE_ID = "ws-1";
const OWNER = "user-owner";
const EDITOR = "user-editor";
const OTHER = "user-other";
const WS_VIEWER = "user-ws-viewer";

const ROLES: Record<string, string> = {
  [OWNER]: "member",
  [EDITOR]: "member",
  [OTHER]: "member",
  [WS_VIEWER]: "viewer",
};

interface Grant {
  userId: string;
  role: string;
  invitedById: string | null;
}

interface Where {
  pageId_userId?: { userId: string };
  userId?: string | { in: string[] };
  userId_workspaceId?: { userId: string };
  role?: string;
}

const inSet = (userId: string, where: Where) =>
  where.userId === undefined ||
  (typeof where.userId === "string" ? where.userId === userId : where.userId.in.includes(userId));

function install(db: DeepMockProxy<PrismaClient>, page: { isInviteOnly: boolean }, grants: Grant[]) {
  db.knowledgePage.findUnique.mockImplementation((() =>
    Promise.resolve({
      id: PAGE_ID,
      createdById: OWNER,
      projectId: null,
      workspaceId: WORKSPACE_ID,
      isInviteOnly: page.isInviteOnly,
      databaseId: null,
      docVersion: 0,
    })) as never);
  db.workspaceUser.findUnique.mockImplementation((({ where }: { where: Where }) => {
    const userId = where.userId_workspaceId?.userId ?? "";
    const role = ROLES[userId];
    return Promise.resolve(role ? { role, workspaceId: WORKSPACE_ID } : null);
  }) as never);
  db.workspaceUser.findMany.mockImplementation((({ where }: { where: Where }) =>
    Promise.resolve(
      Object.entries(ROLES)
        .filter(([userId]) => inSet(userId, where))
        .map(([userId, role]) => ({ userId, role })),
    )) as never);
  db.workspaceUser.findFirst.mockImplementation((({ where }: { where: Where }) => {
    const hit = Object.entries(ROLES).find(
      ([userId, role]) => inSet(userId, where) && (where.role === undefined || where.role === role),
    );
    return Promise.resolve(hit ? { userId: hit[0] } : null);
  }) as never);
  db.teamUser.findMany.mockResolvedValue([]);
  db.knowledgePageMember.findUnique.mockImplementation((({ where }: { where: Where }) =>
    Promise.resolve(
      grants.find((g) => g.userId === where.pageId_userId?.userId) ?? null,
    )) as never);
  db.knowledgePageMember.findMany.mockImplementation((({ where }: { where: Where }) =>
    Promise.resolve(grants.filter((g) => inSet(g.userId, where)))) as never);
  db.knowledgePageMember.createMany.mockImplementation((({ data }: { data: Grant[] }) => {
    grants.push(...data.map((d) => ({ userId: d.userId, role: d.role, invitedById: d.invitedById })));
    return Promise.resolve({ count: data.length });
  }) as never);
  db.knowledgePageMember.updateMany.mockImplementation((({
    where,
    data,
  }: {
    where: Where;
    data: { role: string };
  }) => {
    const hit = grants.filter((g) => inSet(g.userId, where));
    hit.forEach((g) => (g.role = data.role));
    return Promise.resolve({ count: hit.length });
  }) as never);
  db.knowledgePageMember.deleteMany.mockImplementation((({ where }: { where: Where }) => {
    const before = grants.length;
    for (let i = grants.length - 1; i >= 0; i--) {
      if (inSet(grants[i]!.userId, where)) grants.splice(i, 1);
    }
    return Promise.resolve({ count: before - grants.length });
  }) as never);
  db.$transaction.mockImplementation(((ops: Promise<unknown>[]) => Promise.all(ops)) as never);
}

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  return error as TRPCError;
}

describe("page sharing rules (ADR-0080)", () => {
  const db = getDbMock();
  let grants: Grant[];

  beforeEach(() => {
    mockReset(db);
    vi.mocked(emitNotification).mockClear();
    grants = [{ userId: WS_VIEWER, role: "viewer", invitedById: OWNER }];
    install(db, { isInviteOnly: false }, grants);
  });

  it("an editor adds people to a workspace page and they are notified", async () => {
    const caller = createMockCaller({ userId: EDITOR, db });
    await expect(
      caller.page.invite({ id: PAGE_ID, userIds: [OTHER], role: "viewer" }),
    ).resolves.toEqual({ added: 1, updated: 0, unchanged: 0 });
    expect(grants).toContainEqual({ userId: OTHER, role: "viewer", invitedById: EDITOR });
    expect(emitNotification).toHaveBeenCalledWith(
      expect.objectContaining({ subject: { pageId: PAGE_ID, invitedUserIds: [OTHER] } }),
    );
  });

  it("someone who can only view cannot share", async () => {
    const caller = createMockCaller({ userId: WS_VIEWER, db });
    const error = await errorOf(caller.page.invite({ id: PAGE_ID, userIds: [OTHER], role: "viewer" }));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("You need edit access to share this page");
  });

  it("an editor cannot change or remove a grant someone else added", async () => {
    const caller = createMockCaller({ userId: EDITOR, db });
    expect(
      (await errorOf(caller.page.updateInvite({ id: PAGE_ID, userId: WS_VIEWER, role: "viewer" }))).code,
    ).toBe("FORBIDDEN");
    expect((await errorOf(caller.page.removeInvite({ id: PAGE_ID, userId: WS_VIEWER }))).code).toBe(
      "FORBIDDEN",
    );
    expect(grants).toEqual([{ userId: WS_VIEWER, role: "viewer", invitedById: OWNER }]);
  });

  it("re-sharing leaves a grant someone else added as it was", async () => {
    grants.push({ userId: OTHER, role: "viewer", invitedById: OWNER });
    const caller = createMockCaller({ userId: EDITOR, db });
    await expect(
      caller.page.invite({ id: PAGE_ID, userIds: [OTHER], role: "editor" }),
    ).resolves.toEqual({ added: 0, updated: 0, unchanged: 1 });
    expect(grants.find((g) => g.userId === OTHER)?.role).toBe("viewer");
  });

  it("an editor changes and removes the grants they added", async () => {
    grants.push({ userId: OTHER, role: "viewer", invitedById: EDITOR });
    const caller = createMockCaller({ userId: EDITOR, db });
    await caller.page.updateInvite({ id: PAGE_ID, userId: OTHER, role: "editor" });
    expect(grants.find((g) => g.userId === OTHER)?.role).toBe("editor");
    await caller.page.removeInvite({ id: PAGE_ID, userId: OTHER });
    expect(grants.find((g) => g.userId === OTHER)).toBeUndefined();
  });

  it("only the owner can make a workspace Viewer an editor", async () => {
    const editor = createMockCaller({ userId: EDITOR, db });
    const refused = await errorOf(
      editor.page.invite({ id: PAGE_ID, userIds: [OTHER, WS_VIEWER], role: "editor" }),
    );
    expect(refused.code).toBe("FORBIDDEN");
    expect(refused.message).toContain("workspace Viewer");
    expect(grants.find((g) => g.userId === OTHER)).toBeUndefined();

    await createMockCaller({ userId: OWNER, db }).page.updateInvite({
      id: PAGE_ID,
      userId: WS_VIEWER,
      role: "editor",
    });
    expect(grants.find((g) => g.userId === WS_VIEWER)?.role).toBe("editor");
  });

  it("the owner changes and removes anyone's grant", async () => {
    grants.push({ userId: OTHER, role: "viewer", invitedById: EDITOR });
    const owner = createMockCaller({ userId: OWNER, db });
    await owner.page.updateInvite({ id: PAGE_ID, userId: OTHER, role: "editor" });
    expect(grants.find((g) => g.userId === OTHER)?.role).toBe("editor");
    await owner.page.removeInvite({ id: PAGE_ID, userId: OTHER });
    expect(grants.find((g) => g.userId === OTHER)).toBeUndefined();
  });

  it("only the owner restricts a page", async () => {
    const editor = createMockCaller({ userId: EDITOR, db });
    expect(
      (await errorOf(editor.page.setInviteOnly({ id: PAGE_ID, inviteOnly: true }))).code,
    ).toBe("FORBIDDEN");
    expect(db.knowledgePage.update).not.toHaveBeenCalled();
  });

  it("an editor grantee of a restricted page can share it but not unrestrict or publish it", async () => {
    grants.push({ userId: EDITOR, role: "editor", invitedById: OWNER });
    install(db, { isInviteOnly: true }, grants);
    const editor = createMockCaller({ userId: EDITOR, db });
    await expect(
      editor.page.invite({ id: PAGE_ID, userIds: [OTHER], role: "viewer" }),
    ).resolves.toMatchObject({ added: 1 });
    expect(
      (await errorOf(editor.page.setInviteOnly({ id: PAGE_ID, inviteOnly: false }))).code,
    ).toBe("FORBIDDEN");
    expect((await errorOf(editor.page.publish({ id: PAGE_ID }))).code).toBe("FORBIDDEN");
  });
});
