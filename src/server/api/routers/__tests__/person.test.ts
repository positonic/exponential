/**
 * Unit tests for the `person` router (the Person page, `/people/<userId>`).
 *
 * The page is a lens on activity the viewer can already see, so these tests pin
 * the two rules that keep it from showing anything new:
 *   1. Scope — the feed covers the VIEWER's workspaces (strict membership, no
 *      project-only guests), not the subject's. That includes a workspace the
 *      subject has left, and excludes one only the subject is in.
 *   2. Not found — an unknown id, a deleted user and a stranger are
 *      indistinguishable, on `get` and on `getFeed`.
 *
 * The Prisma mock answers `workspace.findMany` and
 * `workspaceActivityEvent.findMany` by evaluating the `where` it is given
 * against a small in-memory world, so a resolver that asks the wrong question
 * (e.g. the guest-inclusive visibility clause) gets the wrong answer here too.
 *
 * Uses `mockDeep<PrismaClient>()` — no real DB, ever.
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

// ── The world ────────────────────────────────────────────────────────────────

const VIEWER = "user-viewer";
const SUBJECT = "user-subject";
const STRANGER = "user-stranger";
const DELETED = "user-deleted";

interface WorkspaceFixture {
  id: string;
  name: string;
  slug: string;
  /** Direct `WorkspaceUser` members. */
  members: string[];
  /** Members of a team linked to the workspace. */
  teamMembers: string[];
  /** `ProjectMember`s of a project in the workspace — guests, not members. */
  projectMembers: string[];
}

interface EventFixture {
  id: string;
  workspaceId: string;
  userId: string | null;
  createdAt: Date;
  entityType: string;
  title: string;
}

interface World {
  workspaces: WorkspaceFixture[];
  events: EventFixture[];
  users: Array<{ id: string; name: string; image: string | null; isAgent: boolean }>;
}

function workspace(
  id: string,
  members: string[],
  extra: Partial<WorkspaceFixture> = {},
): WorkspaceFixture {
  return {
    id,
    name: id.toUpperCase(),
    slug: id,
    members,
    teamMembers: [],
    projectMembers: [],
    ...extra,
  };
}

let eventSeq = 0;
function event(
  workspaceId: string,
  userId: string | null,
  createdAt: string,
  title: string,
): EventFixture {
  eventSeq += 1;
  return {
    id: `evt-${String(eventSeq).padStart(3, "0")}`,
    workspaceId,
    userId,
    createdAt: new Date(createdAt),
    entityType: "action",
    title,
  };
}

type Where = Record<string, unknown>;

function someUserId(clause: unknown): string | null {
  const some = (clause as { some?: { userId?: unknown } } | undefined)?.some;
  return typeof some?.userId === "string" ? some.userId : null;
}

/** Evaluate a workspace `where` the way Postgres would, for the keys in use. */
function workspaceMatches(ws: WorkspaceFixture, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    switch (key) {
      case "AND":
        return (value as Where[]).every((clause) => workspaceMatches(ws, clause));
      case "OR":
        return (value as Where[]).some((clause) => workspaceMatches(ws, clause));
      case "id":
        return (value as { in: string[] }).in.includes(ws.id);
      case "members": {
        const userId = someUserId(value);
        return userId !== null && ws.members.includes(userId);
      }
      case "teams": {
        const inner = (value as { some?: { members?: unknown } }).some?.members;
        const userId = someUserId(inner);
        return userId !== null && ws.teamMembers.includes(userId);
      }
      case "projects": {
        const inner = (value as { some?: { projectMembers?: unknown } }).some
          ?.projectMembers;
        const userId = someUserId(inner);
        return userId !== null && ws.projectMembers.includes(userId);
      }
      default:
        throw new Error(`workspace where: unsupported key "${key}"`);
    }
  });
}

function eventMatches(row: EventFixture, where: Where | undefined): boolean {
  if (!where) return true;
  const workspaceId = where.workspaceId as { in: string[] } | undefined;
  if (workspaceId && !workspaceId.in.includes(row.workspaceId)) return false;
  if (typeof where.userId === "string" && row.userId !== where.userId) return false;
  return true;
}

function installWorld(dbMock: DeepMockProxy<PrismaClient>, world: World) {
  dbMock.workspace.findMany.mockImplementation(((args: { where?: Where }) =>
    Promise.resolve(
      world.workspaces
        .filter((ws) => workspaceMatches(ws, args?.where))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, name, slug }) => ({ id, name, slug })),
    )) as never);

  const feedRow = (row: EventFixture) => {
    const user = world.users.find((u) => u.id === row.userId) ?? null;
    const ws = world.workspaces.find((w) => w.id === row.workspaceId)!;
    return {
      id: row.id,
      createdAt: row.createdAt,
      entityType: row.entityType,
      entityId: `${row.id}-entity`,
      action: "created",
      metadata: { title: row.title },
      user,
      workspace: { id: ws.id, name: ws.name, slug: ws.slug },
    };
  };
  const matching = (where: Where | undefined) =>
    world.events
      .filter((row) => eventMatches(row, where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  dbMock.workspaceActivityEvent.findMany.mockImplementation(((args: {
    where?: Where;
    take?: number;
  }) =>
    Promise.resolve(
      matching(args?.where).slice(0, args?.take).map(feedRow),
    )) as never);
  dbMock.workspaceActivityEvent.findFirst.mockImplementation(((args: {
    where?: Where;
  }) => {
    const first = matching(args?.where)[0];
    return Promise.resolve(first ? { id: first.id } : null);
  }) as never);

  dbMock.user.findUnique.mockImplementation(((args: { where: { id?: string } }) =>
    Promise.resolve(
      world.users.find((u) => u.id === args.where.id) ?? null,
    )) as never);
}

function baseWorld(): World {
  return {
    workspaces: [
      // Shared today.
      workspace("alpha", [VIEWER, SUBJECT]),
      // The subject left; the viewer is still a member.
      workspace("beta", [VIEWER]),
      // Only the subject is in it.
      workspace("gamma", [SUBJECT]),
    ],
    events: [
      event("alpha", SUBJECT, "2026-11-10T09:00:00Z", "Alpha old"),
      event("beta", SUBJECT, "2026-11-12T09:00:00Z", "Beta before leaving"),
      event("alpha", SUBJECT, "2026-11-13T09:00:00Z", "Alpha new"),
      event("gamma", SUBJECT, "2026-11-14T09:00:00Z", "Gamma private"),
      event("alpha", VIEWER, "2026-11-13T10:00:00Z", "Viewer's own"),
    ],
    users: [
      { id: VIEWER, name: "Vera Viewer", image: null, isAgent: false },
      { id: SUBJECT, name: "Sam Subject", image: null, isAgent: false },
      { id: STRANGER, name: "Stan Stranger", image: null, isAgent: false },
    ],
  };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    return { code, message };
  }
  throw new Error("expected the call to throw");
}

describe("person router", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  let world: World;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    eventSeq = 0;
    world = baseWorld();
    installWorld(dbMock, world);
  });

  const asViewer = () => createMockCaller({ userId: VIEWER, db: dbMock });

  describe("getFeed", () => {
    it("shows the subject's events across the viewer's workspaces, newest first", async () => {
      const page = await asViewer().person.getFeed({ userId: SUBJECT });

      expect(page.events.map((e) => e.entityRef)).toEqual([
        "Alpha new",
        "Beta before leaving",
        "Alpha old",
      ]);
      expect(page.events.every((e) => e.actor?.id === SUBJECT)).toBe(true);
      expect(page.events[0]?.workspace?.slug).toBe("alpha");
    });

    it("includes events from a workspace the subject left while the viewer remains", async () => {
      const page = await asViewer().person.getFeed({ userId: SUBJECT });

      expect(page.events.map((e) => e.entityRef)).toContain("Beta before leaving");
    });

    it("excludes events from a workspace only the subject is in", async () => {
      const page = await asViewer().person.getFeed({ userId: SUBJECT });

      expect(page.events.map((e) => e.entityRef)).not.toContain("Gamma private");
    });

    it("narrows to one of the viewer's workspaces when asked", async () => {
      const page = await asViewer().person.getFeed({
        userId: SUBJECT,
        workspaceId: "beta",
      });

      expect(page.events.map((e) => e.entityRef)).toEqual(["Beta before leaving"]);
    });

    it("returns an empty page for a workspace filter outside the viewer's workspaces", async () => {
      const page = await asViewer().person.getFeed({
        userId: SUBJECT,
        workspaceId: "gamma",
      });

      expect(page).toEqual({ events: [], nextCursor: null });
    });

    it("does not count a project-only guest's workspace as visible", async () => {
      // The viewer is only a guest of delta (a ProjectMember, not a member).
      world.workspaces.push(
        workspace("delta", [SUBJECT], { projectMembers: [VIEWER] }),
      );
      world.events.push(
        event("delta", SUBJECT, "2026-11-14T12:00:00Z", "Delta guest-only"),
      );

      const page = await asViewer().person.getFeed({ userId: SUBJECT });

      expect(page.events.map((e) => e.entityRef)).not.toContain("Delta guest-only");
    });

    it("counts a workspace the viewer reaches through a team", async () => {
      world.workspaces.push(
        workspace("epsilon", [SUBJECT], { teamMembers: [VIEWER] }),
      );
      world.events.push(
        event("epsilon", SUBJECT, "2026-11-14T13:00:00Z", "Epsilon via team"),
      );

      const page = await asViewer().person.getFeed({ userId: SUBJECT });

      expect(page.events[0]?.entityRef).toBe("Epsilon via team");
    });
  });

  describe("get", () => {
    it("returns the subject's name, image and agent flag, and never an email", async () => {
      const result = await asViewer().person.get({ userId: SUBJECT });

      expect(result.user).toEqual({
        id: SUBJECT,
        name: "Sam Subject",
        image: null,
        isAgent: false,
      });
      const select = dbMock.user.findUnique.mock.calls[0]?.[0]?.select;
      expect(select).toBeDefined();
      expect(select).not.toHaveProperty("email");
    });

    it("is self only for the viewer's own id", async () => {
      const own = await asViewer().person.get({ userId: VIEWER });
      const other = await asViewer().person.get({ userId: SUBJECT });

      expect(own.isSelf).toBe(true);
      expect(other.isSelf).toBe(false);
    });

    it("shows a subject who left every shared workspace but has visible events", async () => {
      // Sam is no longer in alpha either; only the old events remain.
      world.workspaces[0]!.members = [VIEWER];

      const result = await asViewer().person.get({ userId: SUBJECT });

      expect(result.user.id).toBe(SUBJECT);
    });
  });

  describe("not found", () => {
    it("answers an unknown id, a deleted user and a stranger identically", async () => {
      // A deleted user's events survive with a null actor (SET NULL).
      world.events.push(event("alpha", null, "2026-11-01T09:00:00Z", "Orphaned"));
      const caller = asViewer();

      const unknown = await errorOf(caller.person.get({ userId: "no-such-user" }));
      const deleted = await errorOf(caller.person.get({ userId: DELETED }));
      const stranger = await errorOf(caller.person.get({ userId: STRANGER }));

      expect(unknown).toEqual({ code: "NOT_FOUND", message: "Person not found" });
      expect(deleted).toEqual(unknown);
      expect(stranger).toEqual(unknown);
    });

    it("guards the feed the same way, so it cannot be used to probe", async () => {
      const caller = asViewer();

      const unknown = await errorOf(caller.person.getFeed({ userId: "no-such-user" }));
      const stranger = await errorOf(caller.person.getFeed({ userId: STRANGER }));

      expect(unknown).toEqual({ code: "NOT_FOUND", message: "Person not found" });
      expect(stranger).toEqual(unknown);
    });

    it("treats a subject seen only as a guest's project-mate as a stranger", async () => {
      world.workspaces = [
        workspace("alpha", [VIEWER]),
        workspace("delta", [SUBJECT], { projectMembers: [VIEWER] }),
      ];
      world.events = [event("delta", SUBJECT, "2026-11-14T12:00:00Z", "Delta")];

      const result = await errorOf(asViewer().person.get({ userId: SUBJECT }));

      expect(result.code).toBe("NOT_FOUND");
    });
  });
});
