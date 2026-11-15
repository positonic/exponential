/**
 * The context capability (`agentGuidance.context`, `getContext`,
 * `loadScopeInstructions`): a scope's AI instructions, marked as guidance and
 * assembled by the same code chat uses.
 *
 * Mocked Prisma only (CLAUDE.md "Test database safety"); router calls go
 * through `createMockCaller`, as in decision.test.ts.
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

const reportHandledErrorServer = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));

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
import { assembleScopeInstructions } from "~/server/services/ai/scopeInstructions";
import {
  canReadAdrsInContext,
  CONTEXT_ADR_LIMIT,
  CONTEXT_DECISION_LIMIT,
  contextRevision,
  loadScopeInstructions,
} from "../context";

const USER_ID = "user-1";
const WS = { id: "ws-1", slug: "acme", name: "Acme", type: "team", description: null };
const PROJECT = { id: "proj-1", name: "Launch", workspaceId: WS.id };

function caller(db: DeepMockProxy<PrismaClient>, opts: { tokenType?: string; agentRunId?: string } = {}) {
  return createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient, ...opts });
}

/** A direct member of WS, whose workspace carries `aiInstructions`. */
function withWorkspace(db: DeepMockProxy<PrismaClient>, aiInstructions: string | null) {
  db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WS.id } as never);
  db.workspace.findUnique.mockResolvedValue({ ...WS, aiInstructions } as never);
}

/** Not a member of WS, directly or through a team. */
function withoutMembership(db: DeepMockProxy<PrismaClient>) {
  db.workspaceUser.findUnique.mockResolvedValue(null);
  db.teamUser.findFirst.mockResolvedValue(null);
}

function withProject(
  db: DeepMockProxy<PrismaClient>,
  aiInstructions: string | null,
  overrides: Partial<typeof PROJECT> = {},
) {
  db.project.findFirst.mockResolvedValue({ ...PROJECT, aiInstructions, ...overrides } as never);
}

describe("agentGuidance.context", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("returns the scope, marked as guidance, with each instruction's source", async () => {
    withWorkspace(db, "  Weekly review on Fridays.  ");
    withProject(db, "Ship small.");
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context).toMatchObject({
      workspace: { id: WS.id, slug: "acme", name: "Acme" },
      project: { id: PROJECT.id, name: "Launch" },
      authority: "guidance",
      instructions: [
        { scope: "workspace", sourceId: WS.id, text: "Weekly review on Fridays." },
        { scope: "project", sourceId: PROJECT.id, text: "Ship small." },
      ],
    });
    expect(context.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Number.isNaN(Date.parse(context.generatedAt))).toBe(false);
  });

  it("assembles byte-identically to the chat assembler", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    withProject(db, "Ship small.");
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.assembled).toBe(
      assembleScopeInstructions([
        { scope: "workspace", label: "Workspace", instructions: "Weekly review on Fridays." },
        { scope: "project", label: "Project", instructions: "Ship small." },
      ]),
    );
  });

  it("omits empty scopes and assembles nothing when no scope has text", async () => {
    withWorkspace(db, "   ");
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    expect(context.instructions).toEqual([]);
    expect(context.assembled).toBeNull();
    expect(context.project).toBeNull();
  });

  it("refuses a non-member with FORBIDDEN", async () => {
    withoutMembership(db);
    await expect(caller(db).agentGuidance.context({ workspaceId: WS.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a project from another workspace with BAD_REQUEST", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    withProject(db, "Elsewhere.", { workspaceId: "ws-other" });
    await expect(
      caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("loads no project scope, and no error, for a legacy project with no workspace", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    db.project.findFirst.mockResolvedValue({ ...PROJECT, workspaceId: null, aiInstructions: "Legacy." } as never);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.project).toBeNull();
    expect(context.instructions.map((i) => i.scope)).toEqual(["workspace"]);
    expect(context.assembled).not.toContain("Legacy.");
  });

  it("gives no project text for a spoofed project the caller can't see", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    db.project.findFirst.mockResolvedValue(null);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: "someone-elses" });
    expect(context.project).toBeNull();
    expect(context.instructions.map((i) => i.scope)).toEqual(["workspace"]);
    expect(context.assembled).not.toContain("project_instructions");
    // The project read is access-scoped, never a bare id lookup.
    const where = db.project.findFirst.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ id: "someone-elses" });
    expect(Object.keys(where).length).toBeGreaterThan(1);
  });

  it("changes revision when, and only when, an instruction text changes", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    const first = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    const again = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    expect(again.revision).toBe(first.revision);

    withWorkspace(db, "Weekly review on Thursdays.");
    const changed = await caller(db).agentGuidance.context({ workspaceId: WS.id });
    expect(changed.revision).not.toBe(first.revision);
  });

  it("is not human-only: agent-key and agent-context callers succeed", async () => {
    withWorkspace(db, "Weekly review on Fridays.");
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    await expect(
      caller(db, { tokenType: "agent-key" }).agentGuidance.context({ workspaceId: WS.id }),
    ).resolves.toMatchObject({ authority: "guidance" });
    await expect(
      caller(db, { tokenType: "agent-context", agentRunId: "run-1" }).agentGuidance.context({ workspaceId: WS.id }),
    ).resolves.toMatchObject({ authority: "guidance" });
  });
});

describe("loadScopeInstructions (the chat route's fetch)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("loads nothing when no scope is asked for", async () => {
    const loaded = await loadScopeInstructions(db as unknown as PrismaClient, { userId: USER_ID });
    expect(loaded).toEqual({ workspace: null, project: null });
    expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it("does not reject a workspace-less legacy project in a workspace context (the chat route's 400)", async () => {
    withWorkspace(db, null);
    withProject(db, "Legacy.", { workspaceId: null as unknown as string });
    const loaded = await loadScopeInstructions(db as unknown as PrismaClient, {
      userId: USER_ID,
      workspaceId: WS.id,
      projectId: PROJECT.id,
    });
    expect(loaded.project).toBeNull();
    expect(loaded.workspace?.id).toBe(WS.id);
  });

  it("keeps a project-only scope (no workspace) working", async () => {
    withProject(db, "Ship small.", { workspaceId: "ws-any" });
    const loaded = await loadScopeInstructions(db as unknown as PrismaClient, { userId: USER_ID, projectId: PROJECT.id });
    expect(loaded.project).toEqual({ id: PROJECT.id, name: "Launch", productId: null, aiInstructions: "Ship small." });
  });

  it("admits a team-linked member through the central resolver", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue({ role: "member", team: { workspaceId: WS.id } } as never);
    db.workspace.findUnique.mockResolvedValue({ ...WS, aiInstructions: "Team rules." } as never);
    const loaded = await loadScopeInstructions(db as unknown as PrismaClient, { userId: USER_ID, workspaceId: WS.id });
    expect(loaded.workspace?.aiInstructions).toBe("Team rules.");
  });
});

describe("agentGuidance.context decisions", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  const decidedAt = new Date("2026-11-10T00:00:00.000Z");
  function withDecisions(rows: { id: string; number: number; statement: string; projectId: string | null }[], total?: number) {
    db.decision.findMany.mockResolvedValue(rows.map((r) => ({ ...r, decidedAt })) as never);
    db.decision.count.mockResolvedValue(total ?? rows.length);
  }

  it("lists the project's decisions with label, statement and a link, never the body", async () => {
    withWorkspace(db, null);
    withProject(db, null);
    withDecisions([{ id: "dec-1", number: 70, statement: "Free is unlimited people.", projectId: PROJECT.id }]);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.decisions.omitted).toBe(0);
    expect(context.decisions.items).toHaveLength(1);
    const [d] = context.decisions.items;
    expect(d).toMatchObject({
      id: "dec-1",
      label: "D-0070",
      statement: "Free is unlimited people.",
      scope: "project",
      decidedAt: decidedAt.toISOString(),
    });
    expect(d!.url).toMatch(/\/w\/acme\/decisions\/d\/dec-1$/);
    expect(d).not.toHaveProperty("body");
    const select = db.decision.findMany.mock.calls[0]![0]!.select!;
    expect(select).not.toHaveProperty("body");
  });

  it("reads only ACCEPTED, confirmed decisions through the access resolver, newest first, capped", async () => {
    withWorkspace(db, null);
    withProject(db, null);
    withDecisions([], 0);
    await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    const args = db.decision.findMany.mock.calls[0]![0]!;
    const and = (args.where as { AND: Record<string, unknown>[] }).AND;
    // The resolver clause: workspace-scoped and confirmed-only.
    expect(and[0]).toMatchObject({ workspaceId: WS.id, reviewState: "CONFIRMED" });
    expect(and[0]).toHaveProperty("OR");
    expect(and[1]).toEqual({ status: "ACCEPTED", reviewState: "CONFIRMED" });
    expect(and[2]).toEqual({ projectId: PROJECT.id });
    expect(args.take).toBe(CONTEXT_DECISION_LIMIT);
    expect(args.orderBy).toEqual([{ decidedAt: { sort: "desc", nulls: "last" } }, { number: "desc" }]);
  });

  it("adds project-less decisions on the project's product, marked as product scope", async () => {
    withWorkspace(db, null);
    withProject(db, null, { productId: "prod-1" } as Partial<typeof PROJECT>);
    withDecisions([{ id: "dec-2", number: 3, statement: "Ship on Paddle.", projectId: null }]);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    const and = (db.decision.findMany.mock.calls[0]![0]!.where as { AND: unknown[] }).AND;
    expect(and[2]).toEqual({ OR: [{ projectId: PROJECT.id }, { projectId: null, productId: "prod-1" }] });
    expect(context.decisions.items[0]!.scope).toBe("product");
  });

  it("says how many decisions the cap left out", async () => {
    withWorkspace(db, null);
    withProject(db, null);
    withDecisions([{ id: "dec-1", number: 1, statement: "One.", projectId: PROJECT.id }], 25);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.decisions.omitted).toBe(24);
  });

  it("reads no decisions without a visible project", async () => {
    withWorkspace(db, null);
    db.project.findFirst.mockResolvedValue(null);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: "someone-elses" });
    expect(context.decisions).toEqual({ items: [], omitted: 0 });
    expect(db.decision.findMany).not.toHaveBeenCalled();
  });

  it("folds decisions into the revision, leaving it unchanged when there are none", () => {
    const instructions = [{ scope: "workspace" as const, sourceId: WS.id, text: "Rules." }];
    const bare = contextRevision(instructions);
    expect(contextRevision(instructions, { items: [], omitted: 0 })).toBe(bare);
    const item = { id: "d", label: "D-0001", statement: "A.", scope: "project" as const, decidedAt: null, url: "u" };
    const withOne = contextRevision(instructions, { items: [item], omitted: 0 });
    expect(withOne).not.toBe(bare);
    expect(contextRevision(instructions, { items: [{ ...item, statement: "B." }], omitted: 0 })).not.toBe(withOne);
  });
});

describe("agentGuidance.context ADRs", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.decision.findMany.mockResolvedValue([]);
    db.decision.count.mockResolvedValue(0);
  });

  const decidedAt = new Date("2026-10-01T00:00:00.000Z");
  const PRODUCT = "prod-1";
  function withProductProject() {
    withProject(db, null, { productId: PRODUCT } as Partial<typeof PROJECT>);
  }
  function withAdrs(
    rows: { id: string; number: number | null; title: string; repoProductId: string | null; shortCode?: string }[],
    total?: number,
  ) {
    db.adrDocument.findMany.mockResolvedValue(
      rows.map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        decidedAt,
        repository: {
          productId: r.repoProductId,
          adrSyncConfigs: r.shortCode ? [{ shortCode: r.shortCode }] : [],
        },
      })) as never,
    );
    db.adrDocument.count.mockResolvedValue(total ?? rows.length);
  }

  it("lists accepted ADRs on the project's product with label, title, status and a link, never the body", async () => {
    withWorkspace(db, null);
    withProductProject();
    withAdrs([
      { id: "adr-1", number: 60, title: "Decisions beside ADRs", repoProductId: PRODUCT, shortCode: "EXP" },
      { id: "adr-2", number: 3, title: "Shared auth", repoProductId: null },
      { id: "adr-3", number: null, title: "Unnumbered", repoProductId: PRODUCT },
    ]);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs.omitted).toBe(0);
    expect(context.adrs.items).toMatchObject([
      { id: "adr-1", label: "EXP-0060", title: "Decisions beside ADRs", status: "ACCEPTED", scope: "product", decidedAt: decidedAt.toISOString() },
      { id: "adr-2", label: "ADR-0003", scope: "linked" },
      { id: "adr-3", label: null },
    ]);
    expect(context.adrs.items[0]!.url).toMatch(/\/w\/acme\/decisions\/adr-1$/);
    expect(context.adrs.items[0]).not.toHaveProperty("body");
    expect(db.adrDocument.findMany.mock.calls[0]![0]!.select).not.toHaveProperty("body");
  });

  it("reads only accepted, live ADRs from enrolled repos, reached through the product, newest first, capped", async () => {
    withWorkspace(db, null);
    withProductProject();
    withAdrs([]);
    await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    const args = db.adrDocument.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({
      AND: [
        { deletedAt: null, status: "ACCEPTED" },
        { repository: { workspaceId: WS.id, adrSyncConfigs: { some: { workspaceId: WS.id } } } },
        {
          OR: [
            { repository: { productId: PRODUCT } },
            { ticketLinks: { some: { OR: [{ ticket: { productId: PRODUCT } }, { feature: { productId: PRODUCT } }] } } },
          ],
        },
      ],
    });
    expect(args.take).toBe(CONTEXT_ADR_LIMIT);
    expect(args.orderBy).toEqual([{ decidedAt: { sort: "desc", nulls: "last" } }, { number: { sort: "desc", nulls: "last" } }]);
  });

  it("says how many ADRs the cap left out", async () => {
    withWorkspace(db, null);
    withProductProject();
    withAdrs([{ id: "adr-1", number: 1, title: "One", repoProductId: PRODUCT }], 31);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs.omitted).toBe(30);
  });

  it("reads no ADRs for a project with no product", async () => {
    withWorkspace(db, null);
    withProject(db, null);
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs).toEqual({ items: [], omitted: 0 });
    expect(db.adrDocument.findMany).not.toHaveBeenCalled();
  });

  it("gives an agent with a write role ADRs while its owner still belongs", async () => {
    withWorkspace(db, null);
    withProductProject();
    withAdrs([{ id: "adr-1", number: 1, title: "One", repoProductId: PRODUCT }]);
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    db.externalAgent.findUnique.mockResolvedValue({ id: "agent-1", ownerId: "owner-1" } as never);
    // First lookup: the agent's own membership; second: its owner's.
    db.workspaceUser.findUnique
      .mockResolvedValueOnce({ role: "member", workspaceId: WS.id } as never)
      .mockResolvedValueOnce({ role: "owner", workspaceId: WS.id } as never);
    const context = await caller(db, { tokenType: "agent-key" }).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs.items.map((a) => a.id)).toEqual(["adr-1"]);
  });

  it("gives an agent none once its owner has left the workspace", async () => {
    withWorkspace(db, null);
    withProductProject();
    withAdrs([{ id: "adr-1", number: 1, title: "One", repoProductId: PRODUCT }]);
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    db.externalAgent.findUnique.mockResolvedValue({ id: "agent-1", ownerId: "owner-1" } as never);
    db.workspaceUser.findUnique
      .mockResolvedValueOnce({ role: "member", workspaceId: WS.id } as never)
      .mockResolvedValueOnce(null);
    db.teamUser.findFirst.mockResolvedValue(null);
    const context = await caller(db, { tokenType: "agent-key" }).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs).toEqual({ items: [], omitted: 0 });
    expect(db.adrDocument.findMany).not.toHaveBeenCalled();
  });

  it("gives none when the principal resolver refuses (a shadow user with no agent)", async () => {
    withWorkspace(db, null);
    withProductProject();
    db.user.findUnique.mockResolvedValue({ isAgent: true } as never);
    db.externalAgent.findUnique.mockResolvedValue(null);
    const context = await caller(db, { tokenType: "agent-key" }).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs).toEqual({ items: [], omitted: 0 });
  });

  it("gives a viewer none (ADRs are member-visible)", async () => {
    db.workspaceUser.findUnique.mockResolvedValue({ role: "viewer", workspaceId: WS.id } as never);
    db.workspace.findUnique.mockResolvedValue({ ...WS, aiInstructions: null } as never);
    withProductProject();
    const context = await caller(db).agentGuidance.context({ workspaceId: WS.id, projectId: PROJECT.id });
    expect(context.adrs).toEqual({ items: [], omitted: 0 });
    expect(db.adrDocument.findMany).not.toHaveBeenCalled();
  });

  it("needs a write role for every principal, and a present owner for an agent", () => {
    const human = { kind: "human" as const, userId: "u", surface: "web" as const };
    const zoe = { kind: "agent_for_human" as const, userId: "u", surface: "whatsapp" as const };
    const agent = { kind: "agent" as const, userId: "s", agentId: "a", ownerId: "o", surface: "agent-key" as const };
    expect(canReadAdrsInContext(human, "member")).toBe(true);
    expect(canReadAdrsInContext(human, "viewer")).toBe(false);
    expect(canReadAdrsInContext(human, "guest")).toBe(false);
    expect(canReadAdrsInContext(human, undefined)).toBe(false);
    expect(canReadAdrsInContext(zoe, "member")).toBe(true);
    expect(canReadAdrsInContext(agent, "member", "viewer")).toBe(true);
    expect(canReadAdrsInContext(agent, "member", null)).toBe(false);
    expect(canReadAdrsInContext(agent, "viewer", "owner")).toBe(false);
    expect(canReadAdrsInContext(null, "member")).toBe(false);
  });

  it("folds ADRs into the revision, leaving it unchanged when there are none", () => {
    const instructions = [{ scope: "workspace" as const, sourceId: WS.id, text: "Rules." }];
    const none = { items: [], omitted: 0 };
    const bare = contextRevision(instructions, none);
    expect(contextRevision(instructions, none, none)).toBe(bare);
    const item = { id: "a", label: "ADR-0001", title: "A", status: "ACCEPTED" as const, scope: "product" as const, decidedAt: null, url: "u" };
    const withOne = contextRevision(instructions, none, { items: [item], omitted: 0 });
    expect(withOne).not.toBe(bare);
    expect(contextRevision(instructions, none, { items: [{ ...item, title: "B" }], omitted: 0 })).not.toBe(withOne);
    expect(contextRevision(instructions, none, { items: [item], omitted: 1 })).not.toBe(withOne);
  });
});
