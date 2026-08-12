/**
 * Binding rooms to projects and workspaces.
 *
 * The three modes must stay distinguishable — Inherit is an absent row, Room is an
 * active one, Off is an inactive one — because each leads to different behaviour when a
 * post is attempted. Mocked Prisma; no DB.
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
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(32);
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

const USER = "user-1";
const WORKSPACE = "ws-1";
const PROJECT = "proj-1";
const SERVER = "int-1";
const ROOM = "!eng:example.org";

let dbMock: DeepMockProxy<PrismaClient>;

function asWorkspaceRole(role: string) {
  dbMock.workspaceUser.findUnique.mockResolvedValue({
    role,
    workspaceId: WORKSPACE,
  } as never);
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

/** Project edit access via ownership, which is the simplest path through the resolver. */
function asProjectOwner() {
  dbMock.project.findUnique.mockResolvedValue({
    id: PROJECT,
    createdById: USER,
    workspaceId: WORKSPACE,
    isRestricted: false,
    teamId: null,
  } as never);
  dbMock.projectMember.findFirst.mockResolvedValue(null as never);
}

beforeEach(() => {
  dbMock = getDbMock();
  mockReset(dbMock);
  dbMock.user.findUnique.mockResolvedValue({ isAgent: false } as never);
  dbMock.integration.findFirst.mockResolvedValue({ id: SERVER } as never);
});

describe("matrixRoom.bind", () => {
  it("creates an active outbound row for a project", async () => {
    asWorkspaceRole("member");
    asProjectOwner();
    dbMock.channelLink.findFirst.mockResolvedValue(null as never);
    dbMock.channelLink.create.mockResolvedValue({
      id: "link-1",
      externalId: ROOM,
    } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.bind({
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        serverId: SERVER,
        roomId: ROOM,
        roomName: "Engineering",
      }),
    ).resolves.toMatchObject({ roomId: ROOM });

    const created = dbMock.channelLink.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(created.data).toMatchObject({
      provider: "matrix",
      direction: "outbound",
      externalId: ROOM,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      isActive: true,
      serverIntegrationId: SERVER,
    });
  });

  it("refuses a server registered to another workspace", async () => {
    asWorkspaceRole("owner");
    asProjectOwner();
    dbMock.integration.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.bind({
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        serverId: "int-elsewhere",
        roomId: ROOM,
      }),
    ).rejects.toThrow(/not registered in this workspace/);
    expect(dbMock.channelLink.create).not.toHaveBeenCalled();
  });

  it("requires owner/admin for the workspace default, not mere membership", async () => {
    asWorkspaceRole("member");

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.bind({
        workspaceId: WORKSPACE,
        projectId: null,
        serverId: SERVER,
        roomId: ROOM,
      }),
    ).rejects.toThrow(/requires the owner or admin role/);
    expect(dbMock.channelLink.create).not.toHaveBeenCalled();
  });

  it("lets an admin set the workspace default", async () => {
    asWorkspaceRole("admin");
    dbMock.channelLink.findFirst.mockResolvedValue(null as never);
    dbMock.channelLink.create.mockResolvedValue({
      id: "link-ws",
      externalId: ROOM,
    } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.bind({
        workspaceId: WORKSPACE,
        projectId: null,
        serverId: SERVER,
        roomId: ROOM,
      }),
    ).resolves.toMatchObject({ roomId: ROOM });

    const created = dbMock.channelLink.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(created.data.projectId).toBeNull();
  });
});

describe("matrixRoom.setOff", () => {
  it("deactivates rather than deleting, so Off stays distinct from never-configured", async () => {
    asWorkspaceRole("member");
    asProjectOwner();
    dbMock.channelLink.findFirst.mockResolvedValue({ id: "link-1" } as never);
    dbMock.channelLink.update.mockResolvedValue({ id: "link-1" } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.setOff({ workspaceId: WORKSPACE, projectId: PROJECT }),
    ).resolves.toEqual({ off: true });

    expect(dbMock.channelLink.update).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { isActive: false },
    });
    expect(dbMock.channelLink.delete).not.toHaveBeenCalled();
  });

  it("creates an inactive row when the project had no binding at all", async () => {
    asWorkspaceRole("member");
    asProjectOwner();
    dbMock.channelLink.findFirst.mockResolvedValue(null as never);
    dbMock.channelLink.create.mockResolvedValue({ id: "link-off" } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await caller.matrixRoom.setOff({ workspaceId: WORKSPACE, projectId: PROJECT });

    const created = dbMock.channelLink.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(created.data.isActive).toBe(false);
    // Namespaced, not a real room id — an Off row must not consume a real room's one
    // binding slot under the (provider, externalId) unique.
    expect(created.data.externalId).toBe(`off:${PROJECT}`);
  });
});

describe("matrixRoom.unbind", () => {
  it("removes the row so resolution falls through to the workspace again", async () => {
    asWorkspaceRole("member");
    asProjectOwner();
    dbMock.channelLink.deleteMany.mockResolvedValue({ count: 1 } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.unbind({ workspaceId: WORKSPACE, projectId: PROJECT }),
    ).resolves.toEqual({ removed: 1 });

    expect(dbMock.channelLink.deleteMany).toHaveBeenCalledWith({
      where: {
        provider: "matrix",
        direction: "outbound",
        workspaceId: WORKSPACE,
        projectId: PROJECT,
      },
    });
  });
});

describe("matrixRoom.getBinding", () => {
  it("reports inherit plus the room actually inherited from the workspace", async () => {
    asWorkspaceRole("member");
    // No project row; the workspace default answers the resolution call.
    dbMock.channelLink.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: "link-ws",
        externalId: ROOM,
        displayName: "Engineering",
        projectId: null,
        isActive: true,
      } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    const result = await caller.matrixRoom.getBinding({
      workspaceId: WORKSPACE,
      projectId: PROJECT,
    });

    expect(result.mode).toBe("inherit");
    expect(result.effective).toMatchObject({
      kind: "room",
      name: "Engineering",
      inherited: true,
    });
  });

  it("reports off, and an effective destination of off", async () => {
    asWorkspaceRole("member");
    dbMock.channelLink.findFirst.mockResolvedValue({
      id: "link-1",
      externalId: `off:${PROJECT}`,
      displayName: null,
      projectId: PROJECT,
      isActive: false,
    } as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    const result = await caller.matrixRoom.getBinding({
      workspaceId: WORKSPACE,
      projectId: PROJECT,
    });

    expect(result.mode).toBe("off");
    expect(result.room).toBeNull();
    expect(result.effective).toEqual({ kind: "off" });
  });

  it("refuses a non-member", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
    dbMock.teamUser.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: USER, db: dbMock });
    await expect(
      caller.matrixRoom.getBinding({ workspaceId: WORKSPACE, projectId: PROJECT }),
    ).rejects.toThrow(/not a member of this workspace/);
  });
});
