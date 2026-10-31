/**
 * The `database` router (ADR-0078): the typed write path for Databases and
 * their Rows, with access resolved through the holding page.
 *
 * - `create` needs edit access on the page and starts with a title property.
 * - `createRow` rejects a value of the wrong type naming the property, and
 *   places the row where the holding page is.
 * - `listRows` is readable by anyone who can view the page.
 * - `page.get` expands a database marker in the body into a table.
 *
 * Mocked Prisma, as in page-history.test.ts.
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
const triggerPageEmbedding = vi.fn();
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding }),
}));
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ search: vi.fn() }),
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
import { databaseMarker } from "~/lib/databases/marker";

const OWNER = "user-owner";
const MEMBER = "user-member";
const PAGE_ID = "page-1";
const DB_ID = "db-1";
const WORKSPACE_ID = "ws-1";
const TITLE_ID = "ptitle000001";
const STATUS_ID = "pstatus00001";

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAGE_ID,
    title: "Data strategy",
    createdById: OWNER,
    projectId: null,
    workspaceId: WORKSPACE_ID,
    isInviteOnly: false,
    includeInSearch: true,
    isPublic: false,
    databaseId: null,
    properties: null,
    bodyDoc: { type: "doc", content: [{ type: "paragraph" }] },
    body: ["# Data strategy", "", databaseMarker(DB_ID), "", "Closing."].join("\n"),
    docVersion: 3,
    source: null,
    asOf: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-20T00:00:00Z"),
    project: null,
    createdBy: { id: OWNER, name: "Owner", image: null },
    ceremonyOccurrence: null,
    ...overrides,
  };
}

function databaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DB_ID,
    pageId: PAGE_ID,
    workspaceId: WORKSPACE_ID,
    name: "Metrics",
    properties: [
      { id: TITLE_ID, name: "Name", type: "title" },
      { id: STATUS_ID, name: "Status", type: "text" },
    ],
    view: { filters: [], hiddenPropertyIds: [], propertyOrder: [TITLE_ID, STATUS_ID] },
    titlePropertyId: TITLE_ID,
    detachedAt: null,
    createdById: OWNER,
    createdAt: new Date("2026-10-02T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    page: {
      id: PAGE_ID,
      createdById: OWNER,
      projectId: null,
      workspaceId: WORKSPACE_ID,
      isInviteOnly: false,
      docVersion: 3,
      title: "Data strategy",
      includeInSearch: true,
    },
    workspace: { slug: "acme" },
    ...overrides,
  };
}

function rowPage(id: string, title: string, status: string | null) {
  return {
    id,
    title,
    databaseId: DB_ID,
    properties: { [STATUS_ID]: status },
    createdById: OWNER,
    createdAt: new Date("2026-10-03T00:00:00Z"),
    updatedAt: new Date("2026-10-03T00:00:00Z"),
  };
}

function install(db: DeepMockProxy<PrismaClient>, role: "member" | "viewer" = "member") {
  db.knowledgePage.findUnique.mockImplementation((() => Promise.resolve(pageRow())) as never);
  db.pageDatabase.findUnique.mockImplementation((() => Promise.resolve(databaseRow())) as never);
  db.pageDatabase.findMany.mockResolvedValue([databaseRow()] as never);
  db.workspaceUser.findUnique.mockResolvedValue({ role, workspaceId: WORKSPACE_ID } as never);
  db.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(db)) as never);
  db.knowledgePageRevision.findFirst.mockResolvedValue(null);
  db.knowledgePageRevision.create.mockResolvedValue({ id: "rev-new" } as never);
}

async function failureOf(promise: Promise<unknown>): Promise<TRPCError | null> {
  return promise.then(
    () => null,
    (e: unknown) => e as TRPCError,
  );
}

describe("database.create", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    install(db);
  });

  it("creates the database on the page with a title property and returns its marker", async () => {
    db.pageDatabase.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve(databaseRow({ ...args.data, id: DB_ID }))) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const created = await caller.database.create({ pageId: PAGE_ID, name: "  Metrics " });

    const data = db.pageDatabase.create.mock.calls[0]![0].data as {
      name: string;
      pageId: string;
      workspaceId: string;
      properties: { id: string; type: string; name: string }[];
      titlePropertyId: string;
      view: { propertyOrder: string[] };
    };
    expect(data.name).toBe("Metrics");
    expect(data.pageId).toBe(PAGE_ID);
    expect(data.workspaceId).toBe(WORKSPACE_ID);
    expect(data.properties).toHaveLength(1);
    expect(data.properties[0]).toMatchObject({ type: "title", name: "Name" });
    expect(data.titlePropertyId).toBe(data.properties[0]!.id);
    expect(data.view.propertyOrder).toEqual([data.properties[0]!.id]);
    expect(created.marker).toBe(databaseMarker(DB_ID));
    expect(created.page).toEqual({ id: PAGE_ID, title: "Data strategy" });
  });

  it("a viewer of the page cannot create a database on it", async () => {
    install(db, "viewer");
    const caller = createMockCaller({ userId: MEMBER, db });
    const error = await failureOf(caller.database.create({ pageId: PAGE_ID, name: "Metrics" }));
    expect(error?.code).toBe("FORBIDDEN");
    expect(db.pageDatabase.create).not.toHaveBeenCalled();
  });

  it("a row page cannot hold a database", async () => {
    db.knowledgePage.findUnique.mockResolvedValue(pageRow({ databaseId: "other-db" }) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const error = await failureOf(caller.database.create({ pageId: PAGE_ID, name: "Nested" }));
    expect(error?.code).toBe("BAD_REQUEST");
  });
});

describe("database.createRow", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    install(db);
    db.knowledgePage.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...rowPage("row-1", args.data.title as string, null),
        properties: args.data.properties,
      })) as never);
  });

  it("creates a row page placed where the holding page is, keyed by property id", async () => {
    const caller = createMockCaller({ userId: MEMBER, db });
    const row = await caller.database.createRow({
      id: DB_ID,
      values: { Name: "Alert latency", [STATUS_ID]: "Tracked" },
      note: "From the CLEAR page",
    });

    const data = db.knowledgePage.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      title: "Alert latency",
      databaseId: DB_ID,
      workspaceId: WORKSPACE_ID,
      projectId: null,
      includeInSearch: true,
      createdById: MEMBER,
      properties: { [STATUS_ID]: "Tracked" },
    });
    // The title lives on the page, not in the values column.
    expect(data.properties).not.toHaveProperty(TITLE_ID);
    expect(row).toMatchObject({ id: "row-1", title: "Alert latency", values: { [STATUS_ID]: "Tracked" } });
    // A row starts its own history (ADR-0074), with the caller's note.
    expect(db.knowledgePageRevision.create).toHaveBeenCalledTimes(1);
    expect(db.knowledgePageRevision.create.mock.calls[0]![0].data).toMatchObject({
      kind: "create",
      authorId: MEMBER,
      note: "From the CLEAR page",
    });
  });

  it("rejects a value of the wrong type, naming the property", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const error = await failureOf(
      caller.database.createRow({ id: DB_ID, values: { Status: 42 } }),
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect(error?.code).toBe("BAD_REQUEST");
    expect(error?.message).toBe('Property "Status" expects text, got a number');
    expect(db.knowledgePage.create).not.toHaveBeenCalled();
  });

  it("rejects a property the database does not have", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const error = await failureOf(
      caller.database.createRow({ id: DB_ID, values: { Owner: "Ana" } }),
    );
    expect(error?.code).toBe("BAD_REQUEST");
    expect(error?.message).toContain('Property "Owner"');
  });

  it("a viewer of the page cannot add rows", async () => {
    install(db, "viewer");
    const caller = createMockCaller({ userId: MEMBER, db });
    const error = await failureOf(caller.database.createRow({ id: DB_ID, values: {} }));
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("an empty values map still creates an Untitled row", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.database.createRow({ id: DB_ID });
    const data = db.knowledgePage.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.title).toBe("Untitled");
    expect(data.properties).toEqual({});
  });
});

describe("database.listRows and get", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    install(db, "viewer");
    db.knowledgePage.findMany.mockResolvedValue([
      rowPage("row-1", "Alert latency", "Tracked"),
      rowPage("row-2", "Coverage", null),
    ] as never);
    db.knowledgePage.count.mockResolvedValue(2);
  });

  it("a viewer reads rows with typed values and a cursor", async () => {
    const caller = createMockCaller({ userId: MEMBER, db });
    const page = await caller.database.listRows({ id: DB_ID, limit: 1 });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ id: "row-1", title: "Alert latency", values: { [STATUS_ID]: "Tracked" } });
    expect(page.nextCursor).toBe("row-1");
    const args = db.knowledgePage.findMany.mock.calls[0]![0] as { where: unknown; take: number };
    expect(args.where).toEqual({ databaseId: DB_ID });
    expect(args.take).toBe(2);
  });

  it("get returns the parsed definition, the row count and the holding page", async () => {
    const caller = createMockCaller({ userId: MEMBER, db });
    const database = await caller.database.get({ id: DB_ID });
    expect(database.rowCount).toBe(2);
    expect(database.properties.map((p) => p.name)).toEqual(["Name", "Status"]);
    expect(database.view.propertyOrder).toEqual([TITLE_ID, STATUS_ID]);
    expect(database.page).toEqual({ id: PAGE_ID, title: "Data strategy" });
  });
});

describe("page.get expands a database marker", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    install(db);
    db.knowledgePage.findMany.mockResolvedValue([
      rowPage("row-1", "Alert latency", "Tracked"),
    ] as never);
  });

  it("replaces the marker line with the marker plus the table, for markdown and full", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, format: "markdown" });
    expect(page.body).toBe(
      [
        "# Data strategy",
        "",
        databaseMarker(DB_ID),
        "",
        "| Name | Status |",
        "| --- | --- |",
        "| [Alert latency](/w/acme/pages/row-1) | Tracked |",
        "",
        "Closing.",
      ].join("\n"),
    );
    // Only the page's own databases expand.
    const where = (db.pageDatabase.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.pageId).toBe(PAGE_ID);

    const full = await caller.page.get({ id: PAGE_ID });
    expect(full.body).toContain("| Name | Status |");
    expect(full.bodyDoc).toEqual(pageRow().bodyDoc);
  });

  it("a section read sees the table under its heading", async () => {
    db.knowledgePage.findUnique.mockResolvedValue(
      pageRow({ body: ["# Strategy", "", "## Metrics", "", databaseMarker(DB_ID), "", "## Risks", "", "None."].join("\n") }) as never,
    );
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, section: "Metrics" });
    expect(page.body).toContain("| Name | Status |");
    expect(page.body).not.toContain("## Risks");
  });
});
