/**
 * Unit tests for the `ticket` router's `list` Area filter.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB. Mirrors
 * the test layout from `problem.test.ts` / `action.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Seed env vars before any module imports — `vi.hoisted` runs before regular
// top-level statements. Mirrors problem.test.ts.
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

const callerId = "user-1";
const workspaceId = "ws-1";
const productId = "prod-1";
const areaTagId = "tag-clear-api";

/** Stub the workspace-membership probe that `assertWorkspaceMember` runs. */
function stubMembership(dbMock: DeepMockProxy<PrismaClient>, isMember: boolean) {
  dbMock.workspaceUser.findUnique.mockResolvedValue(
    isMember
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ role: "member", workspaceId } as any)
      : null,
  );
}

/**
 * Stub workspace membership *per user*: only `memberIds` belong to
 * `workspaceId`.
 *
 * The plain `stubMembership` above answers the same way for everybody, which
 * is fine while the caller is the only user being resolved. The assignee guard
 * resolves a second user through the very same `workspaceUser.findUnique`, so
 * these tests need a stub that can say "the caller is a member, the assignee
 * is not" — otherwise the interesting case is unreachable.
 */
function stubMembershipByUser(
  dbMock: DeepMockProxy<PrismaClient>,
  memberIds: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbMock.workspaceUser.findUnique.mockImplementation((args: any) => {
    const userId = args?.where?.userId_workspaceId?.userId as string | undefined;
    return Promise.resolve(
      userId && memberIds.includes(userId)
        ? { role: "member", workspaceId }
        : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  });
}

/** Stub the product lookup that `loadProductWithAccess` runs. */
function stubProductLookup(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: productId, workspaceId, slug: "p" } as any,
  );
}

/** Grab the `where` clause from the single ticket.findMany call. */
function findManyWhere(dbMock: DeepMockProxy<PrismaClient>) {
  const call = dbMock.ticket.findMany.mock.calls[0]?.[0];
  return call?.where;
}

describe("ticket router — list Area filter (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubProductLookup(dbMock);
    stubMembership(dbMock, true);
    // depsOut must be present (array) — the procedure maps over it.
    dbMock.ticket.findMany.mockResolvedValue([]);
  });

  it("adds a tags.some constraint when areaTagId is supplied", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.list({ productId, areaTagId });

    expect(findManyWhere(dbMock)).toMatchObject({
      productId,
      tags: { some: { tagId: areaTagId } },
    });
  });

  it("is a no-op when areaTagId is omitted (no tags constraint)", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.list({ productId });

    const where = findManyWhere(dbMock);
    expect(where).toMatchObject({ productId });
    expect(where).not.toHaveProperty("tags");
  });

  it("composes the Area filter with status / type / featureId / epicId / cycleId", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.list({
      productId,
      areaTagId,
      status: "IN_PROGRESS",
      type: "BUG",
      featureId: "feat-1",
      epicId: "epic-1",
      cycleId: "cycle-1",
    });

    expect(findManyWhere(dbMock)).toMatchObject({
      productId,
      status: "IN_PROGRESS",
      type: "BUG",
      featureId: "feat-1",
      epicId: "epic-1",
      cycleId: "cycle-1",
      tags: { some: { tagId: areaTagId } },
    });
  });

  it("only returns tickets carrying the Area tag (filtering is delegated to Prisma)", async () => {
    // The router passes the constraint to Prisma; with the mock returning the
    // matching ticket we assert the result flows through and is shaped (no depsOut).
    dbMock.ticket.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "t1", productId, status: "TODO", depsOut: [] } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.product.ticket.list({ productId, areaTagId });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "t1", openBlockerCount: 0, isBlocked: false });
    expect(result[0]).not.toHaveProperty("depsOut");
    expect(findManyWhere(dbMock)).toMatchObject({ tags: { some: { tagId: areaTagId } } });
  });
});

describe("ticket router — cross-workspace link guard (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubProductLookup(dbMock);
    stubMembership(dbMock, true);
  });

  it("refuses to create a ticket linked to an epic in another workspace", async () => {
    dbMock.epic.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { workspaceId: "ws-other" } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticket.create({
        productId,
        title: "Borrowed epic",
        epicId: "epic-foreign",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Epic not found in this workspace",
    });

    expect(dbMock.ticket.create).not.toHaveBeenCalled();
  });

  it("allows an epic from the product's own workspace", async () => {
    dbMock.epic.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { workspaceId } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    // The create path continues into createTicketWithNumber (counter +
    // transaction), which this mock DB does not model — reaching past the
    // guard is the assertion, so any later failure is not a guard rejection.
    await caller.product.ticket
      .create({ productId, title: "Own epic", epicId: "epic-1" })
      .catch((err: unknown) => {
        expect(err).not.toMatchObject({
          message: "Epic not found in this workspace",
        });
      });

    expect(dbMock.epic.findUnique).toHaveBeenCalledWith({
      where: { id: "epic-1" },
      select: { workspaceId: true },
    });
  });
});

/**
 * `assigneeId` is the same class of hole as the epic/feature/cycle/scope links
 * above, but it resolves to a `User` rather than to a workspace — and
 * `ticket.getById` returns that user's `name` and `email`. Left unguarded, any
 * authenticated user could assign an arbitrary CUID to a ticket in their own
 * product and read a stranger's email straight back out.
 */
describe("ticket router — assignee containment guard (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;
  const outsiderId = "user-outsider";

  /** Stub the pre-update ticket load in `loadTicketWithAccess`. */
  function stubTicketLoad(id = "ticket-1") {
    dbMock.ticket.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id, productId, status: "BACKLOG", product: { workspaceId } } as any,
    );
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubProductLookup(dbMock);
    // The caller belongs to the workspace; the outsider does not.
    stubMembershipByUser(dbMock, [callerId]);
  });

  it("refuses to create a ticket assigned to a non-member", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticket.create({
        productId,
        title: "Harvest an email",
        assigneeId: outsiderId,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Assignee not found in this workspace",
    });

    expect(dbMock.ticket.create).not.toHaveBeenCalled();
  });

  it("allows an assignee who belongs to the product's workspace", async () => {
    stubMembershipByUser(dbMock, [callerId, "user-colleague"]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    // As with the epic case, the create path continues into
    // createTicketWithNumber (counter + transaction), which this mock DB does
    // not model — reaching past the guard is the assertion.
    await caller.product.ticket
      .create({ productId, title: "Own colleague", assigneeId: "user-colleague" })
      .catch((err: unknown) => {
        expect(err).not.toMatchObject({
          message: "Assignee not found in this workspace",
        });
      });
  });

  it("admits a team-based member, matching who can read the ticket", async () => {
    // Not a direct WorkspaceUser, but reachable via a team linked to the
    // workspace — the second path in getWorkspaceMembership, and the same one
    // that lets this user read the ticket at all.
    dbMock.teamUser.findFirst.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { role: "member", team: { workspaceId } } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket
      .create({ productId, title: "Team member", assigneeId: "user-team" })
      .catch((err: unknown) => {
        expect(err).not.toMatchObject({
          message: "Assignee not found in this workspace",
        });
      });
  });

  it("refuses to update a ticket onto a non-member assignee", async () => {
    stubTicketLoad();

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticket.update({ id: "ticket-1", assigneeId: outsiderId }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Assignee not found in this workspace",
    });

    expect(dbMock.ticket.update).not.toHaveBeenCalled();
  });

  it("still allows clearing the assignee (null is not a lookup)", async () => {
    stubTicketLoad();
    dbMock.ticket.update.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "ticket-1", assigneeId: null } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.update({ id: "ticket-1", assigneeId: null });

    expect(dbMock.ticket.update).toHaveBeenCalled();
  });

  it("refuses a bulkUpdate that assigns a non-member", async () => {
    dbMock.ticket.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "ticket-1", status: "BACKLOG", product: { workspaceId } } as any,
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticket.bulkUpdate({
        ids: ["ticket-1"],
        assigneeId: outsiderId,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Assignee not found in this workspace",
    });

    expect(dbMock.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a bulkUpdate linking an epic from another workspace", async () => {
    // bulkUpdate writes epicId/cycleId too, and was never covered by the
    // cross-workspace link guard the create/update paths got.
    dbMock.ticket.findMany.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "ticket-1", status: "BACKLOG", product: { workspaceId } } as any,
    ]);
    dbMock.epic.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { workspaceId: "ws-other" } as any,
    );

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticket.bulkUpdate({
        ids: ["ticket-1"],
        epicId: "epic-foreign",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Epic not found in this workspace",
    });

    expect(dbMock.ticket.updateMany).not.toHaveBeenCalled();
  });
});

describe("ticket router — getAdjacent (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  /** The where/orderBy of the prev (0) and next (1) findFirst calls. */
  function adjacentCalls(m: DeepMockProxy<PrismaClient>) {
    return [
      m.ticket.findFirst.mock.calls[0]?.[0],
      m.ticket.findFirst.mock.calls[1]?.[0],
    ] as const;
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubProductLookup(dbMock);
    stubMembership(dbMock, true);
  });

  it("walks to the nearest neighbour on each side rather than assuming +/-1", async () => {
    // Numbering has gaps (2, 6, 9) — deleting a ticket must not strand its
    // neighbours behind a 404.
    dbMock.ticket.findFirst
      .mockResolvedValueOnce({ number: 2, title: "two" } as never)
      .mockResolvedValueOnce({ number: 9, title: "nine" } as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.product.ticket.getAdjacent({
      productId,
      number: 6,
    });

    expect(result).toEqual({
      prev: { number: 2, title: "two" },
      next: { number: 9, title: "nine" },
    });

    const [prevCall, nextCall] = adjacentCalls(dbMock);
    // Closest-first ordering is what makes it the *nearest* neighbour.
    expect(prevCall).toMatchObject({
      where: { productId, number: { lt: 6 } },
      orderBy: { number: "desc" },
    });
    expect(nextCall).toMatchObject({
      where: { productId, number: { gt: 6 } },
      orderBy: { number: "asc" },
    });
  });

  it("excludes legacy number=0 tickets from the prev side", async () => {
    // number 0 is the legacy sentinel; those rows have no clean URL to reach.
    dbMock.ticket.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.product.ticket.getAdjacent({ productId, number: 1 });

    const [prevCall] = adjacentCalls(dbMock);
    expect(prevCall).toMatchObject({
      where: { productId, number: { lt: 1, gt: 0 } },
    });
  });

  it("returns null at each boundary of the list", async () => {
    dbMock.ticket.findFirst.mockResolvedValue(null as never);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const result = await caller.product.ticket.getAdjacent({
      productId,
      number: 1,
    });

    expect(result).toEqual({ prev: null, next: null });
  });

  it("refuses a product the caller is not a member of", async () => {
    stubMembership(dbMock, false);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await expect(
      caller.product.ticket.getAdjacent({ productId, number: 3 }),
    ).rejects.toThrow();
    expect(dbMock.ticket.findFirst).not.toHaveBeenCalled();
  });
});
