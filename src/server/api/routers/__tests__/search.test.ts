/**
 * Unit tests for the `search` router's `global` procedure.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB. Mirrors
 * the test layout from `ticket.test.ts` / `problem.test.ts`.
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
}));
vi.mock("~/lib/blob", () => ({
  uploadToBlob: vi.fn().mockResolvedValue({ url: "blob://test" }),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";
import {
  buildActionAccessWhere,
  buildWorkspaceAccessWhere,
} from "~/server/services/access";

const callerId = "user-1";
const workspaceId = "ws-1";
const workspaceRef = { id: workspaceId, slug: "clear", name: "CLEAR" };

function stubEmptyResults(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspace.findMany.mockResolvedValue([]);
  dbMock.project.findMany.mockResolvedValue([]);
  dbMock.action.findMany.mockResolvedValue([]);
  dbMock.goal.findMany.mockResolvedValue([]);
  dbMock.keyResult.findMany.mockResolvedValue([]);
  dbMock.outcome.findMany.mockResolvedValue([]);
  dbMock.ticket.findMany.mockResolvedValue([]);
  dbMock.feature.findMany.mockResolvedValue([]);
  dbMock.epic.findMany.mockResolvedValue([]);
  dbMock.knowledgePage.findMany.mockResolvedValue([]);
  dbMock.transcriptionSession.findMany.mockResolvedValue([]);
  dbMock.crmContact.findMany.mockResolvedValue([]);
  dbMock.crmOrganization.findMany.mockResolvedValue([]);
  dbMock.product.findMany.mockResolvedValue([]);
}

describe("search router — global (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubEmptyResults(dbMock);
  });

  it("merges typed results across entities and strips HTML from action titles", async () => {
    dbMock.workspace.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: workspaceId, name: "CLEAR", slug: "clear" } as any,
    ]);
    dbMock.project.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "p1", name: "Onionpress Proposal", slug: "onion-p1", status: "ACTIVE", workspace: workspaceRef } as any,
    ]);
    dbMock.action.findMany.mockResolvedValue([
      {
        id: "a1",
        name: 'Watch <a href="https://example.com">Brewster talk</a>',
        kanbanStatus: "TODO",
        workspace: null,
        project: { name: "Onionpress Proposal", workspace: workspaceRef },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);
    dbMock.goal.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 7, title: "Trusted decision layer", status: "active", workspace: workspaceRef } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.global({ query: "brew" });

    expect(res.query).toBe("brew");
    expect(res.results.map((r) => r.type)).toEqual([
      "workspace",
      "project",
      "action",
      "goal",
    ]);

    const action = res.results.find((r) => r.type === "action");
    expect(action?.title).toBe("Watch Brewster talk");
    expect(action?.workspace).toEqual(workspaceRef);
    expect(action?.url).toBe("/w/clear/actions/a1");

    const goal = res.results.find((r) => r.type === "goal");
    expect(goal?.id).toBe("7");
    expect(goal?.url).toBe("/w/clear/goals/7");

    const project = res.results.find((r) => r.type === "project");
    expect(project?.url).toBe("/w/clear/projects/onion-p1");
  });

  it("scopes actions via the canonical bulk resolver, excludes DELETED/DRAFT, matches name case-insensitively", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.search.global({ query: "brew" });

    const where = dbMock.action.findMany.mock.calls[0]?.[0]?.where;
    expect(where?.name).toEqual({ contains: "brew", mode: "insensitive" });
    expect(where?.status).toEqual({ notIn: ["DELETED", "DRAFT"] });
    // Access scoping comes from buildActionAccessWhere, not a hand-rolled copy.
    expect(where?.OR).toEqual(buildActionAccessWhere(callerId).OR);
  });

  it("scopes epics to direct-or-team workspace membership, like the epic router", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.search.global({ query: "brew" });

    const epicWhere = dbMock.epic.findMany.mock.calls[0]?.[0]?.where;
    // Access scoping comes from buildWorkspaceAccessWhere (direct OR
    // team-based membership), not a hand-rolled direct-members-only copy.
    expect(epicWhere?.workspace).toEqual({ is: buildWorkspaceAccessWhere(callerId) });
  });

  it("workspace-scoped search filters projects/goals to the workspace for members", async () => {
    // Direct membership: not a guest, getWorkspaceMembership succeeds.
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.search.global({ query: "brew", workspaceId });

    const projectWhere = dbMock.project.findMany.mock.calls[0]?.[0]?.where;
    expect(projectWhere?.workspaceId).toBe(workspaceId);
    // Members get the full access clause, not the guest-only clause.
    expect(projectWhere?.projectMembers).toBeUndefined();

    const goalWhere = dbMock.goal.findMany.mock.calls[0]?.[0]?.where;
    expect(goalWhere?.workspaceId).toBe(workspaceId);
  });

  it("workspace-scoped search returns no goals and only shared projects for guests", async () => {
    // No direct membership, no team membership, but a ProjectMember row:
    // the "guest" shape from isWorkspaceGuest.
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    dbMock.teamUser.findFirst.mockResolvedValue(null);
    dbMock.projectMember.findFirst.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "pm-1" } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.global({ query: "brew", workspaceId });

    const projectWhere = dbMock.project.findMany.mock.calls[0]?.[0]?.where;
    expect(projectWhere?.projectMembers).toEqual({ some: { userId: callerId } });

    expect(dbMock.goal.findMany).not.toHaveBeenCalled();
    expect(res.results.filter((r) => r.type === "goal")).toEqual([]);
  });
});
