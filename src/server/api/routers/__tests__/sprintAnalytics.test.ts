/**
 * Unit tests for the `sprintAnalytics` router's access gating.
 *
 * The agent-facing procedures run on `apiKeyMiddleware`, which only
 * authenticates the caller. They used to pass a bare `workspaceId` / `listId`
 * straight to the service, so any signed-in user or API key could read another
 * workspace's sprint data and write burndown snapshots into it. Each now checks
 * the caller's membership of the target workspace, and the snapshot write
 * needs a non-viewer role.
 *
 * Mocked Prisma + a mocked service: no real DB, ever.
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


const serviceMock = vi.hoisted(() => ({
  getActiveSprint: vi.fn(),
  getSprintMetrics: vi.fn(),
  getBurndownData: vi.fn(),
  detectRiskSignals: vi.fn(),
  getVelocityHistory: vi.fn(),
  captureDailySnapshot: vi.fn(),
  getWorkspaceCycles: vi.fn(),
}));
const githubMock = vi.hoisted(() => ({ getActivitySummary: vi.fn() }));

vi.mock("~/server/services/SprintAnalyticsService", () => ({
  sprintAnalyticsService: serviceMock,
}));
vi.mock("~/server/services/GitHubActivityService", () => ({
  githubActivityService: githubMock,
}));

import { createMockCaller } from "~/test/trpc-helpers";
import { createCaller } from "~/server/api/root";

const WORKSPACE_ID = "ws-1";
const USER_ID = "user-1";
const LIST_ID = "cycle-1";

type Role = "owner" | "admin" | "member" | "viewer";

let dbMock: DeepMockProxy<PrismaClient>;

/** The caller's role in WORKSPACE_ID, or null for a non-member. */
function stubRole(role: Role | null) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    role ? ({ role, workspaceId: WORKSPACE_ID } as never) : (null as never),
  );
  dbMock.teamUser.findFirst.mockResolvedValue(null as never);
}

function stubList() {
  dbMock.list.findUnique.mockResolvedValue(
    { workspaceId: WORKSPACE_ID } as never,
  );
}

type Caller = ReturnType<typeof createMockCaller>;

/** Every agent-facing read, with the service method it must not reach. */
const READS: {
  name: string;
  call: (c: Caller) => Promise<unknown>;
  service: () => { mock: { calls: unknown[] } };
}[] = [
  {
    name: "getActiveSprint",
    call: (c) => c.sprintAnalytics.getActiveSprint({ workspaceId: WORKSPACE_ID }),
    service: () => serviceMock.getActiveSprint,
  },
  {
    name: "getMetrics",
    call: (c) => c.sprintAnalytics.getMetrics({ listId: LIST_ID }),
    service: () => serviceMock.getSprintMetrics,
  },
  {
    name: "getBurndown",
    call: (c) => c.sprintAnalytics.getBurndown({ listId: LIST_ID }),
    service: () => serviceMock.getBurndownData,
  },
  {
    name: "getRiskSignals",
    call: (c) => c.sprintAnalytics.getRiskSignals({ listId: LIST_ID }),
    service: () => serviceMock.detectRiskSignals,
  },
  {
    name: "getVelocityHistory",
    call: (c) =>
      c.sprintAnalytics.getVelocityHistory({ workspaceId: WORKSPACE_ID }),
    service: () => serviceMock.getVelocityHistory,
  },
  {
    name: "getGitHubActivity",
    call: (c) =>
      c.sprintAnalytics.getGitHubActivity({
        workspaceId: WORKSPACE_ID,
        since: new Date("2026-01-01"),
      }),
    service: () => githubMock.getActivitySummary,
  },
];

describe("sprintAnalytics router access gating (mocked)", () => {
  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    for (const fn of [...Object.values(serviceMock), githubMock.getActivitySummary]) {
      fn.mockReset();
      fn.mockResolvedValue({});
    }
    stubList();
  });

  describe.each(READS)("$name", ({ call, service }) => {
    it("refuses a non-member of the target workspace", async () => {
      stubRole(null);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(call(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(service().mock.calls).toHaveLength(0);
    });

    it("lets a viewer read", async () => {
      stubRole("viewer");
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await call(caller);
      expect(service().mock.calls).toHaveLength(1);
    });
  });

  it("checks the list's own workspace, not one the caller names", async () => {
    stubRole("member");
    dbMock.list.findUnique.mockResolvedValue(
      { workspaceId: "ws-other" } as never,
    );
    dbMock.workspaceUser.findUnique.mockImplementation(((args: {
      where: { userId_workspaceId: { workspaceId: string } };
    }) =>
      Promise.resolve(
        args.where.userId_workspaceId.workspaceId === WORKSPACE_ID
          ? { role: "member", workspaceId: WORKSPACE_ID }
          : null,
      )) as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.sprintAnalytics.getMetrics({ listId: LIST_ID }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(serviceMock.getSprintMetrics).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unknown list", async () => {
    stubRole("member");
    dbMock.list.findUnique.mockResolvedValue(null as never);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.sprintAnalytics.getBurndown({ listId: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("captureDailySnapshot", () => {
    it("refuses a viewer and writes nothing", async () => {
      stubRole("viewer");
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.sprintAnalytics.captureDailySnapshot({ listId: LIST_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(serviceMock.captureDailySnapshot).not.toHaveBeenCalled();
    });

    it("refuses a non-member", async () => {
      stubRole(null);
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await expect(
        caller.sprintAnalytics.captureDailySnapshot({ listId: LIST_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(serviceMock.captureDailySnapshot).not.toHaveBeenCalled();
    });

    it("lets a member capture a snapshot", async () => {
      stubRole("member");
      const caller = createMockCaller({ userId: USER_ID, db: dbMock });
      await caller.sprintAnalytics.captureDailySnapshot({ listId: LIST_ID });
      expect(serviceMock.captureDailySnapshot).toHaveBeenCalledWith(LIST_ID);
    });
  });

  describe("API-key authentication", () => {
    function apiKeyCaller() {
      const headers = new Headers();
      headers.set("x-api-key", "exp_test_key");
      return createCaller({ db: dbMock, session: null, headers });
    }

    beforeEach(() => {
      dbMock.verificationToken.findFirst.mockResolvedValue({
        userId: USER_ID,
        token: "sha256:x",
        expires: new Date(Date.now() + 60_000),
      } as never);
    });

    it("a valid key alone does not unlock another workspace", async () => {
      stubRole(null);
      await expect(
        apiKeyCaller().sprintAnalytics.getActiveSprint({
          workspaceId: WORKSPACE_ID,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(serviceMock.getActiveSprint).not.toHaveBeenCalled();
    });

    it("a key whose user is a member reads normally", async () => {
      stubRole("member");
      await apiKeyCaller().sprintAnalytics.getActiveSprint({
        workspaceId: WORKSPACE_ID,
      });
      expect(serviceMock.getActiveSprint).toHaveBeenCalledWith(WORKSPACE_ID);
    });
  });

  it("admits a team-based member to the Metrics page (previously direct-only)", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null as never);
    dbMock.teamUser.findFirst.mockResolvedValue(
      { role: "member", team: { workspaceId: WORKSPACE_ID } } as never,
    );
    serviceMock.getWorkspaceCycles.mockResolvedValue([]);
    const caller = createMockCaller({ userId: USER_ID, db: dbMock });
    await expect(
      caller.sprintAnalytics.getCycles({ workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual([]);
  });
});
