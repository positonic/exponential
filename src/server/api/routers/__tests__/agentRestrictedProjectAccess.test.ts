/**
 * An External agent (ADR-0049) and a restricted project.
 *
 * Reproduces ticket alpha.shark (ticket 819): an agent account that is a member of
 * the workspace but not of a restricted project is refused on
 * `project.getById`, `page.get` and `page.create` in that project — and the
 * FORBIDDEN it got back said only "Access denied", so its owner could not tell
 * which account was refused or what access it lacked.
 *
 * The refusal is correct (privacy holds — the agent was never granted the
 * project). What changes is that the error names the account and the missing
 * access, and that a project admin can grant it: an agent may be added as a
 * project member when its owner has access to the project, never above
 * `editor`, and it leaves the project with its owner (ADR-0049 delegation
 * invariant, extended to project membership).
 *
 * Mocked Prisma (`mockDeep<PrismaClient>()`) over a one-workspace world — no
 * real DB, ever (see CLAUDE.md "Test database safety").
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
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding: vi.fn() }),
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
import {
  canViewKnowledgePage,
  getKnowledgePageAccess,
  getProjectAccess,
  hasProjectAccess,
} from "~/server/services/access";

// ── The world ────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-syntrofi";
const PROJECT_ID = "cmp2l0krk0001l704lgbd37h8";
const PROJECT_NAME = "Manage Syntrofi";
const PAGE_ID = "cmw97r3lx0001jm07dm0npx51";

/** The workspace owner, who created the restricted project and the page. */
const JAMES = { id: "user-james", name: "James Farrell", email: "james@example.com", isAgent: false };
/** James's External agent: a workspace member, not a project member. */
const CLAUDE = { id: "cmsfscxn70000jy04iyppvkp0", name: "Claude Desktop", email: null, isAgent: true };
/** Another human in the workspace with no access to the restricted project. */
const ANDI = { id: "user-andi", name: "Andi", email: "andi@example.com", isAgent: false };
/** Andi's agent — its owner can't see the project, so it can't be let in. */
const ANDI_AGENT = { id: "agent-andi", name: "Andi's agent", email: null, isAgent: true };

const USERS = [JAMES, CLAUDE, ANDI, ANDI_AGENT];
const EXTERNAL_AGENTS = [
  { id: "ext-claude", name: "Claude Desktop", ownerId: JAMES.id, shadowUserId: CLAUDE.id },
  { id: "ext-andi", name: "Andi's agent", ownerId: ANDI.id, shadowUserId: ANDI_AGENT.id },
];
const WORKSPACE_ROLES: Record<string, string> = {
  [JAMES.id]: "owner",
  [CLAUDE.id]: "member",
  [ANDI.id]: "member",
  [ANDI_AGENT.id]: "member",
};

const PROJECT = {
  id: PROJECT_ID,
  name: PROJECT_NAME,
  slug: "manage_syntrofi_",
  createdById: JAMES.id,
  teamId: null,
  workspaceId: WORKSPACE_ID,
  isPublic: false,
  isRestricted: true,
};

const PAGE = {
  id: PAGE_ID,
  title: "Syntrofi weekly notes",
  createdById: JAMES.id,
  projectId: PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  isInviteOnly: false,
  databaseId: null,
  docVersion: 1,
  body: null,
  bodyDoc: null,
  includeInSearch: true,
  isPublic: false,
  publicId: null,
  publicSlug: null,
  publicSeoIndexed: false,
  publishedAt: null,
  source: null,
  asOf: null,
  properties: null,
  createdAt: new Date("2026-11-09T10:00:00Z"),
  updatedAt: new Date("2026-11-09T10:00:00Z"),
  project: { id: PROJECT_ID, name: PROJECT_NAME, slug: "manage_syntrofi_" },
  createdBy: { id: JAMES.id, name: JAMES.name, image: null },
  ceremonyOccurrence: null,
};

/** Project members, mutated by `project.addMember` / `removeMember`. */
let projectMembers: Map<string, string>;

function installWorld(db: DeepMockProxy<PrismaClient>) {
  projectMembers = new Map();

  db.project.findUnique.mockImplementation(((args: { where: { id?: string; slug?: string } }) =>
    Promise.resolve(args.where.id === PROJECT_ID ? PROJECT : null)) as never);

  db.projectMember.findFirst.mockImplementation(((args: { where: { userId: string } }) => {
    const role = projectMembers.get(args.where.userId);
    return Promise.resolve(role ? { role } : null);
  }) as never);
  db.projectMember.findUnique.mockImplementation(((args: {
    where: { projectId_userId: { userId: string } };
  }) => {
    const role = projectMembers.get(args.where.projectId_userId.userId);
    return Promise.resolve(role ? { role } : null);
  }) as never);
  db.projectMember.upsert.mockImplementation(((args: {
    create: { userId: string; role: string };
  }) => {
    projectMembers.set(args.create.userId, args.create.role);
    return Promise.resolve({ id: `pm-${args.create.userId}`, ...args.create });
  }) as never);
  db.projectMember.deleteMany.mockImplementation(((args: {
    where: { userId: string | { in: string[] } };
  }) => {
    const ids =
      typeof args.where.userId === "string" ? [args.where.userId] : args.where.userId.in;
    let count = 0;
    for (const id of ids) if (projectMembers.delete(id)) count++;
    return Promise.resolve({ count });
  }) as never);

  db.teamUser.findUnique.mockResolvedValue(null);
  db.teamUser.findFirst.mockResolvedValue(null);

  db.workspaceUser.findUnique.mockImplementation(((args: {
    where: { userId_workspaceId: { userId: string; workspaceId: string } };
  }) => {
    const { userId, workspaceId } = args.where.userId_workspaceId;
    const role = workspaceId === WORKSPACE_ID ? WORKSPACE_ROLES[userId] : undefined;
    return Promise.resolve(role ? { role, workspaceId, userId } : null);
  }) as never);

  db.knowledgePage.findUnique.mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve(args.where.id === PAGE_ID ? PAGE : null)) as never);

  db.user.findUnique.mockImplementation(((args: { where: { id: string } }) =>
    Promise.resolve(USERS.find((u) => u.id === args.where.id) ?? null)) as never);

  db.externalAgent.findUnique.mockImplementation(((args: {
    where: { shadowUserId?: string; id?: string };
  }) =>
    Promise.resolve(
      EXTERNAL_AGENTS.find(
        (a) =>
          (args.where.shadowUserId && a.shadowUserId === args.where.shadowUserId) ||
          (args.where.id && a.id === args.where.id),
      ) ?? null,
    )) as never);
  db.externalAgent.findFirst.mockImplementation(((args: {
    where: { shadowUserId?: string };
  }) =>
    Promise.resolve(
      EXTERNAL_AGENTS.find((a) => a.shadowUserId === args.where.shadowUserId) ?? null,
    )) as never);
  db.externalAgent.findMany.mockImplementation(((args: { where: { ownerId: string } }) =>
    Promise.resolve(EXTERNAL_AGENTS.filter((a) => a.ownerId === args.where.ownerId))) as never);
}

function callerFor(user: { id: string; name: string; email: string | null }) {
  return createMockCaller({
    userId: user.id,
    db: getDbMock(),
    name: user.name,
    email: user.email ?? undefined,
  });
}

async function forbidden(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("FORBIDDEN");
    return (error as TRPCError).message;
  }
  throw new Error("expected FORBIDDEN, but the call succeeded");
}

beforeEach(() => {
  mockReset(getDbMock());
  installWorld(getDbMock());
});

// ── The bug: refused, and told nothing ───────────────────────────────────────

describe("an agent that is a workspace member but not a member of a restricted project", () => {
  it("is refused on project.getById, and the error names the account and the missing access", async () => {
    const message = await forbidden(callerFor(CLAUDE).project.getById({ id: PROJECT_ID }));

    expect(message).toContain("Claude Desktop");
    expect(message).toContain(CLAUDE.id);
    expect(message).toContain(PROJECT_NAME);
    expect(message).toMatch(/restricted/i);
    expect(message).toMatch(/members/i);
    // The owner is the person who can act on it.
    expect(message).toContain("James Farrell");
  });

  it("is refused on page.get for a page in that project, and the error explains the project", async () => {
    const message = await forbidden(callerFor(CLAUDE).page.get({ id: PAGE_ID }));

    expect(message).toContain("Claude Desktop");
    expect(message).toContain(PROJECT_NAME);
    expect(message).toMatch(/restricted/i);
    expect(message).toMatch(/members/i);
  });

  it("is refused on page.create into that project, with the same explanation", async () => {
    const message = await forbidden(
      callerFor(CLAUDE).page.create({
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: "Agent notes",
      }),
    );

    expect(message).toContain("Claude Desktop");
    expect(message).toContain(PROJECT_NAME);
    expect(message).toMatch(/restricted/i);
  });

  it("a human in the same position gets the same explanation, without agent wording", async () => {
    const message = await forbidden(callerFor(ANDI).project.getById({ id: PROJECT_ID }));

    expect(message).toContain("Andi");
    expect(message).toContain(PROJECT_NAME);
    expect(message).not.toMatch(/agent/i);
  });

  it("someone outside the workspace is told that, not about project membership", async () => {
    const stranger = { id: "user-stranger", name: "Stranger", email: "s@example.com", isAgent: false };
    USERS.push(stranger);
    try {
      const message = await forbidden(callerFor(stranger).project.getById({ id: PROJECT_ID }));
      expect(message).toContain("Stranger");
      expect(message).toMatch(/workspace/i);
      expect(message).not.toMatch(/Members tab/i);
    } finally {
      USERS.pop();
    }
  });
});

// ── Who the token is ─────────────────────────────────────────────────────────

describe("user.getCurrentUser", () => {
  it("tells an agent account that it is one, and who owns it", async () => {
    const me = await callerFor(CLAUDE).user.getCurrentUser();

    expect(me.id).toBe(CLAUDE.id);
    expect(me.name).toBe("Claude Desktop");
    expect(me.isAgent).toBe(true);
    expect(me.agent).toEqual({
      id: "ext-claude",
      name: "Claude Desktop",
      owner: { id: JAMES.id, name: JAMES.name },
    });
  });

  it("marks a person as not an agent", async () => {
    const me = await callerFor(JAMES).user.getCurrentUser();

    expect(me.isAgent).toBe(false);
    expect(me.agent).toBeNull();
  });
});

// ── The fix: a project admin grants the agent the project ────────────────────

describe("granting an agent a restricted project", () => {
  it("the project creator adds their own agent as a member, and the agent can then read the project and its pages", async () => {
    await callerFor(JAMES).project.addMember({
      projectId: PROJECT_ID,
      userId: CLAUDE.id,
      role: "editor",
    });
    expect(projectMembers.get(CLAUDE.id)).toBe("editor");

    const db = getDbMock();
    expect(hasProjectAccess(await getProjectAccess(db, CLAUDE.id, PROJECT_ID))).toBe(true);
    expect(canViewKnowledgePage(await getKnowledgePageAccess(db, CLAUDE.id, PAGE))).toBe(true);
  });

  it("refuses an agent whose owner has no access to the project — delegation never exceeds the owner's", async () => {
    await expect(
      callerFor(JAMES).project.addMember({
        projectId: PROJECT_ID,
        userId: ANDI_AGENT.id,
        role: "editor",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(projectMembers.has(ANDI_AGENT.id)).toBe(false);
  });

  it("admits the agent once its owner is a member", async () => {
    const james = callerFor(JAMES);
    await james.project.addMember({ projectId: PROJECT_ID, userId: ANDI.id, role: "editor" });
    await james.project.addMember({ projectId: PROJECT_ID, userId: ANDI_AGENT.id, role: "viewer" });

    expect(projectMembers.get(ANDI_AGENT.id)).toBe("viewer");
  });

  it("never makes an agent a project admin", async () => {
    await expect(
      callerFor(JAMES).project.addMember({
        projectId: PROJECT_ID,
        userId: CLAUDE.id,
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(projectMembers.has(CLAUDE.id)).toBe(false);
  });

  it("removing a person from the project removes their agents with them", async () => {
    const james = callerFor(JAMES);
    await james.project.addMember({ projectId: PROJECT_ID, userId: ANDI.id, role: "editor" });
    await james.project.addMember({ projectId: PROJECT_ID, userId: ANDI_AGENT.id, role: "editor" });

    await james.project.removeMember({ projectId: PROJECT_ID, userId: ANDI.id });

    expect(projectMembers.has(ANDI.id)).toBe(false);
    expect(projectMembers.has(ANDI_AGENT.id)).toBe(false);
  });
});

// ── Privacy holds ────────────────────────────────────────────────────────────

describe("without a grant", () => {
  it("the agent still cannot read the project or the page", async () => {
    const db = getDbMock();
    expect(hasProjectAccess(await getProjectAccess(db, CLAUDE.id, PROJECT_ID))).toBe(false);
    expect(canViewKnowledgePage(await getKnowledgePageAccess(db, CLAUDE.id, PAGE))).toBe(false);
    await forbidden(callerFor(CLAUDE).project.getById({ id: PROJECT_ID }));
    await forbidden(callerFor(CLAUDE).page.get({ id: PAGE_ID }));
  });

  it("the agent cannot grant itself the project", async () => {
    await expect(
      callerFor(CLAUDE).project.addMember({
        projectId: PROJECT_ID,
        userId: CLAUDE.id,
        role: "editor",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(projectMembers.has(CLAUDE.id)).toBe(false);
  });
});
