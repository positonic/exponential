/**
 * Unit tests for `workspace.listMembers` — the roster API and CLI callers use
 * to turn a name into a user id so they can write `@[Name](userId)` mentions.
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

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

function caller(db: DeepMockProxy<PrismaClient>) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
}

/**
 * Satisfy `requireWorkspaceMembership("view")`, which resolves through
 * AccessControlService rather than reading WorkspaceUser inline.
 */
function grantAccess(db: DeepMockProxy<PrismaClient>) {
  db.workspaceUser.findUnique.mockResolvedValue({
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role: "owner",
  } as never);
  db.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID,
    ownerId: USER_ID,
  } as never);
}

function directRow(id: string, name: string | null, role = "member") {
  return { role, user: { id, name, email: `${id}@example.com`, image: null } };
}

function teamRow(id: string, name: string | null, role = "member") {
  return {
    role,
    user: { id, name, email: `${id}@example.com`, image: null },
    team: { id: "team-1", name: "Platform" },
  };
}

describe("workspace.listMembers", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("refuses callers who are not members", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.workspace.findUnique.mockResolvedValue(null);

    await expect(
      caller(db).workspace.listMembers({ workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow();
  });

  it("returns direct members with ready-to-paste mention syntax", async () => {
    grantAccess(db);
    db.workspaceUser.findMany.mockResolvedValue([
      directRow("u1", "Andi Stanner", "admin"),
    ] as never);
    db.teamUser.findMany.mockResolvedValue([] as never);

    const members = await caller(db).workspace.listMembers({
      workspaceId: WORKSPACE_ID,
    });

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: "u1",
      role: "admin",
      source: "workspace",
      mentionSyntax: "@[Andi Stanner](u1)",
    });
  });

  it("includes team-based members, marked as such", async () => {
    grantAccess(db);
    db.workspaceUser.findMany.mockResolvedValue([] as never);
    db.teamUser.findMany.mockResolvedValue([teamRow("u2", "Team Only")] as never);

    const members = await caller(db).workspace.listMembers({
      workspaceId: WORKSPACE_ID,
    });

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: "u2",
      source: "team",
      // The TEAM role is "member" here, but the point is that a team role
      // never lands in `role` — it is reported separately.
      role: "member",
      teamRole: "member",
      mentionSyntax: "@[Team Only](u2)",
    });
    expect(members[0]?.teams).toEqual([{ id: "team-1", name: "Platform" }]);
  });

  it("lists someone once when they are both a direct and a team member, keeping the direct role", async () => {
    grantAccess(db);
    db.workspaceUser.findMany.mockResolvedValue([
      directRow("u1", "Andi Stanner", "owner"),
    ] as never);
    db.teamUser.findMany.mockResolvedValue([
      teamRow("u1", "Andi Stanner", "member"),
    ] as never);

    const members = await caller(db).workspace.listMembers({
      workspaceId: WORKSPACE_ID,
    });

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: "u1",
      role: "owner",
      teamRole: null,
      source: "workspace",
    });
    // The team still shows up, so callers can see how the access is granted.
    expect(members[0]?.teams).toEqual([{ id: "team-1", name: "Platform" }]);
  });

  it("never reports a team role as the workspace role", async () => {
    grantAccess(db);
    db.workspaceUser.findMany.mockResolvedValue([] as never);
    db.teamUser.findMany.mockResolvedValue([
      teamRow("u9", "Team Owner", "owner"),
    ] as never);

    const members = await caller(db).workspace.listMembers({
      workspaceId: WORKSPACE_ID,
    });

    // A team owner has no workspace-level authority — callers reading `role`
    // to gate on owner/admin must not be misled.
    expect(members[0]?.role).toBe("member");
    expect(members[0]?.teamRole).toBe("owner");
  });

  it("falls back to the email when a member has no display name", async () => {
    grantAccess(db);
    db.workspaceUser.findMany.mockResolvedValue([directRow("u3", null)] as never);
    db.teamUser.findMany.mockResolvedValue([] as never);

    const members = await caller(db).workspace.listMembers({
      workspaceId: WORKSPACE_ID,
    });

    expect(members[0]?.mentionSyntax).toBe("@[u3@example.com](u3)");
  });

  it("sorts by display name so output is stable", async () => {
    grantAccess(db);
    db.workspaceUser.findMany.mockResolvedValue([
      directRow("u2", "Zoe"),
      directRow("u1", "Andi Stanner"),
    ] as never);
    db.teamUser.findMany.mockResolvedValue([] as never);

    const members = await caller(db).workspace.listMembers({
      workspaceId: WORKSPACE_ID,
    });

    expect(members.map((m) => m.name)).toEqual(["Andi Stanner", "Zoe"]);
  });
});
