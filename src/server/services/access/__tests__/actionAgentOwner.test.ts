/**
 * The per-row side of "the owner of an agent reaches what that agent created".
 *
 * An agent writes as its shadow user (ADR-0049), so an Action it creates with
 * no project and no assignee had exactly one reader: the agent. Its owner
 * could not find it in search, open it, or tick it off. `getActionAccess`
 * now resolves the creating agent's owner, and grants them the action while
 * they still belong to its workspace: read at any role, write at a write
 * role. The Prisma WHERE twins are property-tested against these checks in
 * `actionWriteWhere.test.ts`.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// `actionResolver` pulls in `~/server/db` transitively, which validates env at
// module load. Seed the minimum before imports (same as permissions.test.ts).
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import {
  canEditAction,
  canViewAction,
  checkActionPermission,
  getActionAccess,
} from "../resolvers/actionResolver";

const OWNER = "user-owner";
const TEAMMATE = "user-teammate";
const AGENT_SHADOW = "user-agent-shadow";
const WORKSPACE = "ws-1";

/** The columns `getActionAccess` selects. */
interface AccessRow {
  createdById: string;
  projectId: string | null;
  workspaceId: string | null;
  assignees: { userId: string }[];
  createdBy: { externalAgentShadow: { ownerId: string } | null };
  project: { workspaceId: string | null } | null;
}

/** The columns `getWorkspaceMembership` selects from a direct membership. */
interface MembershipRow {
  role: string;
  workspaceId: string;
}

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

/**
 * Make a mocked Prisma method resolve `value`. The resolver selects a few
 * columns, so the stub is typed as that selection, not the whole model.
 */
function resolves<T>(method: unknown, value: T): void {
  (method as Mock<() => Promise<T>>).mockImplementation(() => Promise.resolve(value));
}

/** The row an MCP `actions.create` with no project and no assignee writes. */
function agentCreated(overrides: Partial<AccessRow> = {}): AccessRow {
  return {
    createdById: AGENT_SHADOW,
    projectId: null,
    workspaceId: WORKSPACE,
    assignees: [],
    createdBy: { externalAgentShadow: { ownerId: OWNER } },
    project: null,
    ...overrides,
  };
}

/** `role` is the caller's direct role in WORKSPACE; null means not a member. */
function stub(action: AccessRow, role: string | null) {
  resolves<AccessRow | null>(db.action.findUnique, action);
  resolves<MembershipRow | null>(
    db.workspaceUser.findUnique,
    role ? { role, workspaceId: WORKSPACE } : null,
  );
  resolves<null>(db.teamUser.findFirst, null);
}

describe("getActionAccess — the creating agent's owner", () => {
  beforeEach(() => {
    mockReset(db);
  });

  it("reads the creator's agent row and the action's workspace in the same query", async () => {
    stub(agentCreated(), "member");
    await getActionAccess(db, OWNER, "action-1");

    expect(db.action.findUnique).toHaveBeenCalledTimes(1);
    expect(db.action.findUnique.mock.calls[0]?.[0]?.select).toMatchObject({
      workspaceId: true,
      createdBy: { select: { externalAgentShadow: { select: { ownerId: true } } } },
      project: { select: { workspaceId: true } },
    });
  });

  it.each(["member", "admin", "owner"])(
    "lets the owner view, edit and delete a project-less action their agent created, as a workspace %s",
    async (role) => {
      stub(agentCreated(), role);
      const access = await getActionAccess(db, OWNER, "action-1");

      expect(access).toMatchObject({
        isCreator: false,
        hasAgentOwnerAccess: true,
        canEditAsAgentOwner: true,
        isAssignee: false,
        hasProjectAccess: false,
      });
      expect(canViewAction(access!)).toBe(true);
      expect(canEditAction(access!)).toBe(true);
      expect(checkActionPermission(access!, "delete")).toBe(true);
    },
  );

  it("ends with the workspace: an owner who was removed reaches nothing", async () => {
    stub(agentCreated(), null);
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access).toMatchObject({ hasAgentOwnerAccess: false, canEditAsAgentOwner: false });
    expect(canViewAction(access!)).toBe(false);
    expect(canEditAction(access!)).toBe(false);
    expect(checkActionPermission(access!, "delete")).toBe(false);
  });

  it("lets an owner demoted to workspace viewer read, but not edit or delete", async () => {
    stub(agentCreated(), "viewer");
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access).toMatchObject({ hasAgentOwnerAccess: true, canEditAsAgentOwner: false });
    expect(canViewAction(access!)).toBe(true);
    expect(canEditAction(access!)).toBe(false);
    expect(checkActionPermission(access!, "delete")).toBe(false);
  });

  it("judges a row with no workspace of its own by its project's workspace", async () => {
    stub(
      agentCreated({ workspaceId: null, projectId: "p1", project: { workspaceId: WORKSPACE } }),
      null,
    );
    // No project access either: getProjectAccess finds no project row.
    resolves<null>(db.project.findUnique, null);
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access?.hasAgentOwnerAccess).toBe(false);
    expect(db.workspaceUser.findUnique.mock.calls[0]?.[0]?.where).toEqual({
      userId_workspaceId: { userId: OWNER, workspaceId: WORKSPACE },
    });
  });

  it("follows the agent's owner when the action is in no workspace at all", async () => {
    stub(agentCreated({ workspaceId: null }), null);
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access).toMatchObject({ hasAgentOwnerAccess: true, canEditAsAgentOwner: true });
    expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
  });

  it("gives a teammate nothing, whatever their role: the action stays personal", async () => {
    stub(agentCreated(), "owner");
    const access = await getActionAccess(db, TEAMMATE, "action-1");

    expect(access).toMatchObject({ hasAgentOwnerAccess: false, canEditAsAgentOwner: false });
    expect(canViewAction(access!)).toBe(false);
    expect(canEditAction(access!)).toBe(false);
    expect(checkActionPermission(access!, "delete")).toBe(false);
    // Not their agent, so their membership is never even looked up.
    expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
  });

  it("is false when a person, not an agent, created the action", async () => {
    stub(agentCreated({ createdBy: { externalAgentShadow: null } }), "member");
    const access = await getActionAccess(db, OWNER, "action-1");

    expect(access?.hasAgentOwnerAccess).toBe(false);
    expect(canViewAction(access!)).toBe(false);
  });
});
