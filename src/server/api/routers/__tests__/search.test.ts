/**
 * Unit tests for the `search` router's `global` procedure.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` instead of a real
 * database, so they run in milliseconds and CANNOT touch any real DB. Mirrors
 * the test layout from `ticket.test.ts` / `problem.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
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

// KnowledgeService stub: `search.knowledge` exercises real router logic but
// never reaches OpenAI or pgvector.
const { mockKnowledgeSearch } = vi.hoisted(() => ({ mockKnowledgeSearch: vi.fn() }));
vi.mock("~/server/services/KnowledgeService", () => ({
  KnowledgeService: class MockKnowledgeService {},
  getKnowledgeService: vi.fn(() => ({ search: mockKnowledgeSearch })),
}));

// ── Imports of code under test (must come AFTER vi.mock calls) ───────
import { createMockCaller } from "~/test/trpc-helpers";
import {
  buildActionAccessWhere,
  buildWorkspaceAccessWhere,
} from "~/server/services/access";
import { matchesWhere } from "~/test/prismaWhere";

const callerId = "user-1";
const workspaceId = "ws-1";
const workspaceRef = { id: workspaceId, slug: "clear", name: "CLEAR" };

function stubEmptyResults(dbMock: DeepMockProxy<PrismaClient>) {
  dbMock.workspace.findMany.mockResolvedValue([]);
  dbMock.project.findMany.mockResolvedValue([]);
  dbMock.action.findMany.mockResolvedValue([]);
  dbMock.goal.findMany.mockResolvedValue([]);
  dbMock.keyResult.findMany.mockResolvedValue([]);
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

describe("search router — global finds what the caller's agent created (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  const AGENT = "agent-shadow-1";

  interface WorkspaceRow {
    members: { userId: string; role: string }[];
    teams: { members: { userId: string }[] }[];
  }

  interface ActionRow {
    id: string;
    name: string;
    status: string;
    workspaceId: string | null;
    workspace: WorkspaceRow | null;
    createdById: string;
    /** The creator's agent row: null for a person, the owner for a shadow user. */
    createdBy: { externalAgentShadow: { ownerId: string } | null };
    assignees: { userId: string }[];
    projectId: null;
    project: null;
  }

  /** The columns the action block of `search.global` selects. */
  interface ActionHit {
    id: string;
    name: string;
    kanbanStatus: null;
    workspace: typeof workspaceRef;
    project: null;
  }

  /** The workspace as the caller stands in it: `role` null means not a member. */
  const workspaceWhere = (role: string | null): WorkspaceRow => ({
    members: role ? [{ userId: callerId, role }] : [],
    teams: [],
  });

  /** What an MCP `actions.create` with no project and no assignee writes. */
  const agentAction = (ownerId: string, overrides: Partial<ActionRow> = {}): ActionRow => ({
    id: "a-paddle",
    name: "Open a Paddle account for the Venture Studio UG",
    status: "ACTIVE",
    workspaceId,
    workspace: workspaceWhere("owner"),
    createdById: AGENT,
    createdBy: { externalAgentShadow: { ownerId } },
    assignees: [],
    projectId: null,
    project: null,
    ...overrides,
  });

  /** Stand-in for Postgres: returns the rows the query's own `where` admits. */
  function stubActions(rows: ActionRow[]) {
    const findMany = dbMock.action.findMany as unknown as Mock<
      (args: { where: Record<string, unknown> }) => Promise<ActionHit[]>
    >;
    findMany.mockImplementation((args) =>
      Promise.resolve(
        rows
          .filter((r) => matchesWhere({ ...r }, args.where))
          .map((r) => ({
            id: r.id,
            name: r.name,
            kanbanStatus: null,
            workspace: workspaceRef,
            project: null,
          })),
      ),
    );
  }

  const actionIds = (res: { results: { type: string; id: string }[] }) =>
    res.results.filter((r) => r.type === "action").map((r) => r.id);

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubEmptyResults(dbMock);
  });

  it("finds a project-less, unassigned action created by an agent the caller owns", async () => {
    stubActions([agentAction(callerId)]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    expect(actionIds(await caller.search.global({ query: "paddle", workspaceId }))).toEqual(["a-paddle"]);
    // The palette's "all workspaces" scope sends no workspaceId.
    expect(actionIds(await caller.search.global({ query: "paddle" }))).toEqual(["a-paddle"]);
  });

  it("stops finding it once the caller no longer belongs to the action's workspace", async () => {
    // Removed from the workspace (the agent leaves with its owner, ADR-0049):
    // the all-workspaces scope sends no workspaceId, so the access clause
    // alone has to keep the row out.
    stubActions([agentAction(callerId, { workspace: workspaceWhere(null) })]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    expect(actionIds(await caller.search.global({ query: "paddle" }))).toEqual([]);
    expect(actionIds(await caller.search.global({ query: "paddle", workspaceId }))).toEqual([]);
  });

  it("keeps it from everyone else: a project-less action stays personal", async () => {
    // Created by a teammate's agent, and by a teammate in person, in a
    // workspace the caller owns.
    stubActions([
      agentAction("someone-else"),
      agentAction("someone-else", {
        id: "a-human",
        createdById: "someone-else",
        createdBy: { externalAgentShadow: null },
      }),
    ]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    expect(actionIds(await caller.search.global({ query: "paddle", workspaceId }))).toEqual([]);
  });

  it("still leaves out the owner's agent's DELETED and DRAFT actions", async () => {
    stubActions([
      agentAction(callerId, { id: "a-deleted", status: "DELETED" }),
      agentAction(callerId, { id: "a-draft", status: "DRAFT" }),
    ]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    expect(actionIds(await caller.search.global({ query: "paddle", workspaceId }))).toEqual([]);
  });
});

describe("search router — global ticket search (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  interface TicketRow {
    id: string;
    title: string;
    shortId: string | null;
    number: number;
    status: string;
    updatedAt: number;
    /** The only workspace the caller is a member of is `workspaceId`. */
    workspaceId: string;
  }

  const ticketRow = (
    id: string,
    title: string,
    shortId: string | null,
    number: number,
    ws = workspaceId,
    updatedAt = 0,
  ): TicketRow => ({ id, title, shortId, number, status: "BACKLOG", updatedAt, workspaceId: ws });

  const accessClause = () => ({
    product: { workspace: { is: buildWorkspaceAccessWhere(callerId) } },
  });

  /**
   * Stand-in for Postgres: honours the match clauses the search builds, and
   * hides tickets outside the caller's workspace only when the query carries
   * the access clause — so a search that dropped the scope would leak.
   */
  function matchesTicket(row: TicketRow, where: Record<string, unknown>): boolean {
    if (Array.isArray(where.OR)) {
      return (where.OR as Record<string, unknown>[]).some((w) => matchesTicket(row, w));
    }
    if (Array.isArray(where.AND)) {
      return (where.AND as Record<string, unknown>[]).every((w) => matchesTicket(row, w));
    }
    if ("product" in where) {
      expect(where).toEqual(accessClause());
      return row.workspaceId === workspaceId;
    }
    if (typeof where.number === "number") return row.number === where.number;
    const title = where.title as { contains?: string } | undefined;
    if (title?.contains !== undefined) {
      return row.title.toLowerCase().includes(title.contains.toLowerCase());
    }
    const shortId = where.shortId as { contains?: string; in?: string[] } | undefined;
    if (shortId?.in) return row.shortId !== null && shortId.in.includes(row.shortId);
    if (shortId?.contains !== undefined) {
      return (row.shortId ?? "").toLowerCase().includes(shortId.contains.toLowerCase());
    }
    return true;
  }

  function stubTickets(rows: TicketRow[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.ticket.findMany.mockImplementation(((args: any) => {
      const where = args.where as Record<string, unknown>;
      const hits = rows
        .filter((r) => matchesTicket(r, where))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, args.take as number)
        .map((r) => ({
          ...r,
          product: { slug: "exponential", name: "Exponential", workspace: workspaceRef },
        }));
      return Promise.resolve(hits);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  }

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    stubEmptyResults(dbMock);
  });

  // Six fresher tickets whose fallback shortIds contain both words, so a
  // plain `contains` search fills a 5-row page before reaching the one named.
  const decoys = Array.from({ length: 6 }, (_, i) =>
    ticketRow(`d${i}`, `Thunder work ${i}`, `snappy.thunder.${i}`, 100 + i, workspaceId, 10 + i),
  );
  const named = ticketRow("named", "Search doesn't find fun ids", "snappy.thunder", 42);

  it("finds the ticket an exact short ID names, first", async () => {
    stubTickets([...decoys, named]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.global({ query: "snappy.thunder", limit: 5 });

    const tickets = res.results.filter((r) => r.type === "ticket");
    expect(tickets[0]).toMatchObject({
      id: "named",
      subtitle: "snappy.thunder BACKLOG",
      url: "/w/clear/products/exponential/tickets/snappy.thunder",
    });
    expect(tickets).toHaveLength(5);
  });

  it("tolerates case, whitespace and either word order", async () => {
    stubTickets([...decoys, named]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    for (const query of ["  Snappy.THUNDER  ", "thunder snappy", "#42"]) {
      const res = await caller.search.global({ query, limit: 5 });
      expect(res.results.find((r) => r.type === "ticket")?.id, query).toBe("named");
    }
  });

  it("never returns a ticket the caller cannot see, even when the ID matches exactly", async () => {
    const hidden = ticketRow("hidden", "Someone else's ticket", "brave.otter", 7, "ws-other");
    stubTickets([hidden, named]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });

    const res = await caller.search.global({ query: "brave.otter" });
    expect(res.results.filter((r) => r.type === "ticket")).toEqual([]);
    // Both the exact-ID and the text query carried the access clause.
    expect(dbMock.ticket.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of dbMock.ticket.findMany.mock.calls) {
      expect((args?.where?.AND as unknown[])[0]).toEqual(accessClause());
    }
  });

  it("still finds tickets by ordinary title text", async () => {
    stubTickets([...decoys, named]);
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.global({ query: "doesn't find fun" });
    expect(res.results.filter((r) => r.type === "ticket").map((r) => r.id)).toEqual(["named"]);
    // Title text names no ticket, so only the text query ran.
    expect(dbMock.ticket.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("search router — knowledge (mocked)", () => {
  let dbMock: DeepMockProxy<PrismaClient>;

  const chunk = (
    sourceType: "transcription" | "resource" | "document" | "page",
    sourceId: string,
    similarity: number,
    extra: { url?: string; title?: string; content?: string } = {},
  ) => ({
    id: `c-${sourceId}-${similarity}`,
    content: extra.content ?? `content of ${sourceId}`,
    sourceType,
    sourceId,
    chunkIndex: 0,
    similarity,
    sourceTitle: extra.title ?? `Title ${sourceId}`,
    sourceMeta: { url: extra.url },
  });

  beforeEach(() => {
    dbMock = getDbMock();
    mockReset(dbMock);
    mockKnowledgeSearch.mockReset();
    mockKnowledgeSearch.mockResolvedValue([]);
    dbMock.workspaceUser.findUnique.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { userId: callerId, workspaceId, role: "member" } as any,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.workspace.findUnique.mockResolvedValue({ slug: "clear" } as any);
  });

  it("searches everything the caller may view: access per source, never 'chunks I authored'", async () => {
    const caller = createMockCaller({ userId: callerId, db: dbMock });
    await caller.search.knowledge({ query: "pricing", workspaceId, limit: 5 });

    expect(mockKnowledgeSearch).toHaveBeenCalledWith("pricing", {
      workspaceId,
      pageViewerId: callerId,
      transcriptionViewerId: callerId,
      resourceViewerId: callerId,
      // A person also finds Resources filed under Projects they are in (ADR-0082).
      resourceSharedWithViewer: true,
      sourceTypes: ["transcription", "resource", "page"],
      limit: 20,
    });
    expect(mockKnowledgeSearch.mock.calls[0]![1]).not.toHaveProperty("userId");
  });

  it("returns nothing, without embedding, for a non-member", async () => {
    dbMock.workspaceUser.findUnique.mockResolvedValue(null);
    dbMock.teamUser.findFirst.mockResolvedValue(null);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.knowledge({ query: "pricing", workspaceId });

    expect(res.results).toEqual([]);
    expect(mockKnowledgeSearch).not.toHaveBeenCalled();
  });

  it("keeps each source's best chunk, routes it, and drops weak or routeless hits", async () => {
    mockKnowledgeSearch.mockResolvedValue([
      chunk("transcription", "m1", 0.62, { content: "We agreed  on\n tiered pricing" }),
      chunk("transcription", "m1", 0.55),
      chunk("page", "p1", 0.5),
      chunk("resource", "r1", 0.45, { url: "https://example.com/post" }),
      chunk("resource", "r2", 0.44, { url: "javascript:alert(1)" }),
      chunk("document", "d1", 0.4),
      chunk("page", "p2", 0.2),
    ]);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.knowledge({ query: "pricing", workspaceId });

    expect(res.results.map((r) => [r.sourceType, r.sourceId, r.url, r.external])).toEqual([
      ["transcription", "m1", "/recording/m1", false],
      ["page", "p1", "/w/clear/pages/p1", false],
      ["resource", "r1", "https://example.com/post", true],
    ]);
    expect(res.results[0]?.snippet).toBe("We agreed on tiered pricing");
  });

  it("degrades to no results when the embedding call fails", async () => {
    mockKnowledgeSearch.mockRejectedValue(new Error("openai down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const caller = createMockCaller({ userId: callerId, db: dbMock });
    const res = await caller.search.knowledge({ query: "pricing", workspaceId });

    expect(res.results).toEqual([]);
  });
});
