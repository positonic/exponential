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
const clearPageChunks = vi.fn();
const clearPageChunksMany = vi.fn();
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding, clearPageChunks, clearPageChunksMany }),
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
    triggerPageEmbedding.mockReset();
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
    // The holding page's table and the row's header are both re-indexed.
    expect(triggerPageEmbedding).toHaveBeenCalledWith(PAGE_ID);
    expect(triggerPageEmbedding).toHaveBeenCalledWith("row-1");
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

  it("a row added to a published page is published with its own public id", async () => {
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({ page: { ...databaseRow().page, isPublic: true } }) as never,
    );
    db.knowledgePage.findUniqueOrThrow.mockResolvedValue({ title: "Alert latency", publicId: null, publicSlug: null } as never);
    db.knowledgePage.update.mockResolvedValue({ id: "row-1", isPublic: true } as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.database.createRow({ id: DB_ID, values: { Name: "Alert latency" } });
    const publish = db.knowledgePage.update.mock.calls[0]![0] as { where: { id: string }; data: Record<string, unknown> };
    expect(publish.where.id).toBe("row-1");
    expect(publish.data).toMatchObject({ isPublic: true, publicSlug: "alert-latency" });
    expect(typeof publish.data.publicId).toBe("string");
  });

  it("a row added to an unpublished page stays unpublished", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.database.createRow({ id: DB_ID, values: { Name: "Alert latency" } });
    expect(db.knowledgePage.update).not.toHaveBeenCalled();
  });

  it("an empty values map still creates an Untitled row", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.database.createRow({ id: DB_ID });
    const data = db.knowledgePage.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.title).toBe("Untitled");
    expect(data.properties).toEqual({});
  });
});

describe("database.listRows, update and get", () => {
  const db = getDbMock();
  type Sql = { text: string; values: unknown[] };
  const compiled = (call = 0) => db.$queryRaw.mock.calls[call]![0] as unknown as Sql;
  beforeEach(() => {
    mockReset(db);
    install(db, "viewer");
    db.$queryRaw.mockResolvedValue([
      rowPage("row-1", "Alert latency", "Tracked"),
      rowPage("row-2", "Coverage", null),
    ] as never);
    db.knowledgePage.count.mockResolvedValue(2);
  });

  it("a viewer reads rows with typed values, the visible columns and an offset cursor", async () => {
    const caller = createMockCaller({ userId: MEMBER, db });
    const page = await caller.database.listRows({ id: DB_ID, limit: 1 });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ id: "row-1", title: "Alert latency", values: { [STATUS_ID]: "Tracked" } });
    expect(page.nextCursor).toBe("1");
    expect(page.columns).toEqual([TITLE_ID, STATUS_ID]);
    const q = compiled();
    expect(q.text).toContain('WHERE "databaseId" = $1 ORDER BY "createdAt" ASC, "id" ASC LIMIT $2 OFFSET $3');
    expect(q.values).toEqual([DB_ID, 2, 0]);

    await caller.database.listRows({ id: DB_ID, limit: 1, cursor: "1" });
    expect(compiled(1).values).toEqual([DB_ID, 2, 1]);
  });

  it("the saved view's sort and filters compile into the statement", async () => {
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({
        view: {
          sort: { propertyId: STATUS_ID, direction: "desc" },
          filters: [{ propertyId: STATUS_ID, op: "isNotEmpty" }],
          hiddenPropertyIds: [STATUS_ID],
          propertyOrder: [TITLE_ID, STATUS_ID],
        },
      }) as never,
    );
    const caller = createMockCaller({ userId: MEMBER, db });
    const page = await caller.database.listRows({ id: DB_ID });
    const q = compiled();
    expect(q.text).toContain(`NOT (COALESCE("properties"->>$2, '') IN ('', '[]'))`);
    expect(q.text).toContain('ORDER BY "properties"->>$3 DESC NULLS LAST');
    expect(page.columns).toEqual([TITLE_ID]);
    // Hidden columns are a display concern: the values still come back.
    expect(page.rows[0]!.values).toHaveProperty(STATUS_ID);
  });

  it("a view passed in replaces the saved one for that read, and must resolve", async () => {
    const caller = createMockCaller({ userId: MEMBER, db });
    await caller.database.listRows({
      id: DB_ID,
      view: { filters: [{ propertyId: STATUS_ID, op: "eq", value: "Tracked" }], hiddenPropertyIds: [], propertyOrder: [] },
    });
    expect(compiled().values[1]).toBe(JSON.stringify({ [STATUS_ID]: "Tracked" }));

    const error = await failureOf(
      caller.database.listRows({
        id: DB_ID,
        view: { filters: [{ propertyId: "gone", op: "isEmpty" }], hiddenPropertyIds: [], propertyOrder: [] },
      }),
    );
    expect(error?.code).toBe("BAD_REQUEST");
    expect(error?.message).toContain('"gone"');
    const bad = await failureOf(caller.database.listRows({ id: DB_ID, cursor: "x" }));
    expect(bad?.code).toBe("BAD_REQUEST");
  });

  it("update replaces the view whole and refuses one naming an unknown property; viewers cannot", async () => {
    db.pageDatabase.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...databaseRow(), ...args.data })) as never);
    const viewer = createMockCaller({ userId: MEMBER, db });
    await expect(viewer.database.update({ id: DB_ID, name: "Metrics 2" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    install(db, "member");
    const caller = createMockCaller({ userId: OWNER, db });
    const next = { sort: { propertyId: STATUS_ID, direction: "asc" as const }, filters: [], hiddenPropertyIds: [], propertyOrder: [STATUS_ID, TITLE_ID] };
    const result = await caller.database.update({ id: DB_ID, name: " Metrics 2 ", view: next });
    expect(db.pageDatabase.update.mock.calls[0]![0].data).toEqual({ name: "Metrics 2", view: next });
    expect(result.view).toEqual(next);

    await expect(
      caller.database.update({ id: DB_ID, view: { ...next, hiddenPropertyIds: ["gone"] } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

describe("database properties", () => {
  const db = getDbMock();
  const SELECT_ID = "pselect00001";
  const withSelect = () =>
    databaseRow({
      properties: [
        { id: TITLE_ID, name: "Name", type: "title" },
        { id: STATUS_ID, name: "Status", type: "text" },
        {
          id: SELECT_ID,
          name: "Stage",
          type: "select",
          options: [
            { id: "o_nm", name: "Not measured", color: "gray" },
            { id: "o_tr", name: "Tracked", color: "green" },
          ],
        },
      ],
      view: { filters: [], hiddenPropertyIds: [], propertyOrder: [TITLE_ID, STATUS_ID, SELECT_ID] },
    });
  type Written = { properties?: { id: string; name: string; type: string; options?: { id: string; name: string; color: string }[] }[]; view?: { propertyOrder: string[]; hiddenPropertyIds: string[]; filters: unknown[] } };
  const written = () => db.pageDatabase.update.mock.calls[0]![0].data as Written;

  beforeEach(() => {
    mockReset(db);
    install(db);
    db.pageDatabase.findUnique.mockImplementation((() => Promise.resolve(withSelect())) as never);
    db.pageDatabase.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...withSelect(), ...args.data })) as never);
  });

  it("addProperty appends a select with minted option ids and colours, last in the view", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.addProperty({
      id: DB_ID,
      name: "Dimension",
      type: "select",
      options: [{ name: "Coverage" }, { name: "Latency", color: "red" }],
    });
    const data = written();
    expect(data.properties).toHaveLength(4);
    const added = data.properties![3]!;
    expect(added).toMatchObject({ name: "Dimension", type: "select" });
    expect(added.id).toHaveLength(12);
    expect(added.options!.map((o) => o.name)).toEqual(["Coverage", "Latency"]);
    expect(added.options![0]!.id).toHaveLength(12);
    expect(added.options![1]!.color).toBe("red");
    expect(data.view!.propertyOrder).toEqual([TITLE_ID, STATUS_ID, SELECT_ID, added.id]);
    expect(result.property.id).toBe(added.id);
    expect(result.database.properties).toHaveLength(4);
    expect(triggerPageEmbedding).toHaveBeenCalledWith(PAGE_ID);
    // A schema change never touches a row.
    expect(db.knowledgePage.update).not.toHaveBeenCalled();
    expect(db.knowledgePage.updateMany).not.toHaveBeenCalled();
  });

  it("addProperty refuses a duplicate name, a second title, a relation, and options on a text property", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(caller.database.addProperty({ id: DB_ID, name: "status", type: "text" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: 'A property named "Status" already exists',
    });
    await expect(caller.database.addProperty({ id: DB_ID, name: "Other", type: "title" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.database.addProperty({ id: DB_ID, name: "Problems", type: "relation" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.database.addProperty({ id: DB_ID, name: "Notes", type: "text", options: [{ name: "x" }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.pageDatabase.update).not.toHaveBeenCalled();
  });

  it("a viewer cannot change the schema", async () => {
    install(db, "viewer");
    db.pageDatabase.findUnique.mockImplementation((() => Promise.resolve(withSelect())) as never);
    const caller = createMockCaller({ userId: MEMBER, db });
    await expect(caller.database.addProperty({ id: DB_ID, name: "X", type: "text" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateProperty renames by name and re-options without changing any id", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.updateProperty({
      id: DB_ID,
      propertyId: "Stage",
      name: "Status stage",
      options: [{ id: "o_tr", name: "Being tracked" }, { name: "Dropped" }],
    });
    expect(result.property.id).toBe(SELECT_ID);
    expect(result.property.name).toBe("Status stage");
    const options = result.property.options!;
    expect(options[0]).toMatchObject({ id: "o_tr", name: "Being tracked", color: "green" });
    expect(options[1]!.id).not.toBe("o_nm");
    expect(options).toHaveLength(2);
    expect(written().properties![2]!.id).toBe(SELECT_ID);
    expect(db.knowledgePage.update).not.toHaveBeenCalled();
  });

  it("updateProperty keeps the title's type, rejects a name clash, and drops options when retyping to text", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(
      caller.database.updateProperty({ id: DB_ID, propertyId: TITLE_ID, type: "text" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.database.updateProperty({ id: DB_ID, propertyId: STATUS_ID, name: "stage" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: 'A property named "Stage" already exists' });
    const result = await caller.database.updateProperty({ id: DB_ID, propertyId: SELECT_ID, type: "text" });
    expect(result.property.type).toBe("text");
    expect(result.property.options).toBeUndefined();
  });

  it("removeProperty drops the column from the schema and the view, never the title", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(caller.database.removeProperty({ id: DB_ID, propertyId: TITLE_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await caller.database.removeProperty({ id: DB_ID, propertyId: STATUS_ID });
    const data = written();
    expect(data.properties!.map((p) => p.id)).toEqual([TITLE_ID, SELECT_ID]);
    expect(data.view!.propertyOrder).toEqual([TITLE_ID, SELECT_ID]);
    // Row values under the removed id stay put.
    expect(db.knowledgePage.update).not.toHaveBeenCalled();
    expect(db.knowledgePage.updateMany).not.toHaveBeenCalled();
  });

  it("reorderProperties takes a permutation and nothing else", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(
      caller.database.reorderProperties({ id: DB_ID, propertyIds: [SELECT_ID, TITLE_ID] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const result = await caller.database.reorderProperties({
      id: DB_ID,
      propertyIds: [SELECT_ID, TITLE_ID, STATUS_ID],
    });
    expect(result.properties.map((p) => p.id)).toEqual([SELECT_ID, TITLE_ID, STATUS_ID]);
    expect(result.view.propertyOrder).toEqual([SELECT_ID, TITLE_ID, STATUS_ID]);
  });

  it("createRow resolves a select option by name to its id and names the property on a bad option", async () => {
    db.knowledgePage.create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...rowPage("row-9", "Latency", null), properties: args.data.properties })) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const row = await caller.database.createRow({ id: DB_ID, values: { Name: "Latency", Stage: "tracked" } });
    expect(row.values).toEqual({ [SELECT_ID]: "o_tr" });

    const error = await failureOf(caller.database.createRow({ id: DB_ID, values: { Stage: "Done" } }));
    expect(error?.code).toBe("BAD_REQUEST");
    expect(error?.message).toBe('Property "Stage" has no option "Done"; expects one of: Not measured, Tracked');
  });
});

describe("rows are pages (ADR-0078 §3–4)", () => {
  const db = getDbMock();
  const ROW_ID = "row-1";
  /** A Row page as `page.get` and `loadPageForAccess` load it. */
  const rowFull = (overrides: Record<string, unknown> = {}) =>
    pageRow({
      id: ROW_ID,
      title: "Alert latency",
      databaseId: DB_ID,
      properties: { [STATUS_ID]: "Tracked" },
      body: "How it is measured.",
      createdAt: new Date("2026-10-03T00:00:00Z"),
      updatedAt: new Date("2026-10-04T00:00:00Z"),
      database: databaseRow(),
      ...overrides,
    });

  beforeEach(() => {
    mockReset(db);
    clearPageChunks.mockReset();
    install(db);
    db.$queryRaw.mockResolvedValue([] as never);
    db.knowledgePage.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === ROW_ID ? rowFull() : pageRow())) as never);
  });

  it("page.get on a row puts the property header over the prose and names the database", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: ROW_ID, format: "markdown" });
    expect(page.body).toBe("**Status:** Tracked\n\nHow it is measured.");
    expect(page.database).toEqual({
      id: DB_ID,
      name: "Metrics",
      pageId: PAGE_ID,
      pageTitle: "Data strategy",
      header: "**Status:** Tracked",
      relations: {},
    });
    // The editor's `full` read gets the stored prose only, never the header,
    // so a lazy doc migration or autosave can't write the header into the body.
    const full = await caller.page.get({ id: ROW_ID });
    expect(full.body).toBe("How it is measured.");
    expect(full.database?.header).toBe("**Status:** Tracked");
    // An ordinary page says it belongs to no database.
    const holder = await caller.page.get({ id: PAGE_ID, format: "markdown" });
    expect(holder.database).toBeNull();
  });

  it("the header shows every non-title property, an empty cell as a dash, computed ones from the page", async () => {
    const CREATED = "pcreated0001";
    const BY = "pby000000001";
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({
        properties: [
          { id: TITLE_ID, name: "Name", type: "title" },
          { id: STATUS_ID, name: "Status", type: "text" },
          { id: "pempty000001", name: "Owner notes", type: "text" },
          { id: CREATED, name: "Created", type: "createdTime" },
          { id: BY, name: "Added by", type: "createdBy" },
        ],
      }) as never,
    );
    db.user.findMany.mockResolvedValue([{ id: OWNER, name: "Owner", email: null }] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: ROW_ID, format: "markdown" });
    expect(page.body).toBe(
      [
        "**Status:** Tracked",
        "**Owner notes:** —",
        "**Created:** 2026-10-03T00:00:00.000Z",
        "**Added by:** Owner",
        "",
        "How it is measured.",
      ].join("\n"),
    );
  });

  it("access to a row is the holding page's: an invite-only holder shuts out a workspace member", async () => {
    // The row's own copied placement is workspace-visible; the holder is invite-only.
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({ page: { ...databaseRow().page, isInviteOnly: true } }) as never,
    );
    db.knowledgePageMember.findUnique.mockResolvedValue(null);
    const member = createMockCaller({ userId: MEMBER, db });
    const error = await failureOf(member.page.get({ id: ROW_ID }));
    expect(error?.code).toBe("FORBIDDEN");
    // The holder's owner still reads it.
    const owner = createMockCaller({ userId: OWNER, db });
    await expect(owner.page.get({ id: ROW_ID })).resolves.toMatchObject({ id: ROW_ID });
  });

  it("the Pages list and tree leave rows out", async () => {
    db.knowledgePage.findMany.mockResolvedValue([] as never);
    db.pageLink.findMany.mockResolvedValue([] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.list({ workspaceId: WORKSPACE_ID });
    await caller.page.tree({ workspaceId: WORKSPACE_ID });
    for (const call of db.knowledgePage.findMany.mock.calls) {
      const where = (call[0] as { where: { AND: unknown[] } }).where;
      expect(where.AND).toContainEqual({ databaseId: null });
    }
  });

  it("the access where-clause judges a row by its holding page, never its own placement", async () => {
    const { buildKnowledgePageAccessWhere } = await import("~/server/services/access");
    const where = buildKnowledgePageAccessWhere(OWNER) as { OR: Record<string, unknown>[] };
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toMatchObject({ AND: [{ databaseId: null }, expect.anything()] });
    expect(where.OR[1]).toMatchObject({
      AND: [{ databaseId: { not: null } }, { database: { page: expect.anything() } }],
    });
  });

  it("page.* refuses to move, share, publish, duplicate or delete a row", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const attempts: Promise<unknown>[] = [
      caller.page.move({ id: ROW_ID, workspaceId: WORKSPACE_ID, projectId: null }),
      caller.page.publish({ id: ROW_ID }),
      caller.page.unpublish({ id: ROW_ID }),
      caller.page.setInviteOnly({ id: ROW_ID, inviteOnly: true }),
      caller.page.invite({ id: ROW_ID, userIds: [MEMBER], role: "viewer" }),
      caller.page.duplicate({ id: ROW_ID }),
      caller.page.delete({ id: ROW_ID }),
      caller.page.update({ id: ROW_ID, projectId: null }),
      caller.page.update({ id: ROW_ID, includeInSearch: false }),
    ];
    for (const attempt of attempts) {
      const error = await failureOf(attempt);
      expect(error?.code).toBe("FORBIDDEN");
      expect(error?.message).toContain("Row pages follow their database");
    }
    expect(db.knowledgePage.update).not.toHaveBeenCalled();
    expect(db.knowledgePage.delete).not.toHaveBeenCalled();
  });

  it("moving the holding page moves its databases and rows with it", async () => {
    db.knowledgePage.update.mockResolvedValue(pageRow() as never);
    db.pageDatabase.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgePage.updateMany.mockResolvedValue({ count: 2 } as never);
    db.knowledgePage.findMany.mockResolvedValue([{ id: ROW_ID }] as never);
    db.workspace.findUniqueOrThrow.mockResolvedValue({ slug: "acme" } as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.move({ id: PAGE_ID, workspaceId: WORKSPACE_ID, projectId: null });
    expect(db.pageDatabase.updateMany).toHaveBeenCalledWith({
      where: { pageId: PAGE_ID },
      data: { workspaceId: WORKSPACE_ID },
    });
    expect(db.knowledgePage.updateMany).toHaveBeenCalledWith({
      where: { database: { pageId: PAGE_ID } },
      data: { workspaceId: WORKSPACE_ID, projectId: null },
    });
    expect(triggerPageEmbedding).toHaveBeenCalledWith(ROW_ID);
  });

  it("page.update still takes a row's title, body and note", async () => {
    db.knowledgePage.update.mockResolvedValue(rowFull({ title: "Alert latency (p95)" }) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.update({ id: ROW_ID, title: "Alert latency (p95)" });
    expect(db.knowledgePage.update).toHaveBeenCalledTimes(1);
  });

  it("updateRow merges values, drops cells of removed properties, and records a properties revision", async () => {
    const GONE = "pgone0000001";
    db.knowledgePage.findUnique.mockResolvedValue(
      rowFull({ properties: { [STATUS_ID]: "Tracked", [GONE]: "stale" } }) as never,
    );
    db.$queryRaw.mockResolvedValue([{ properties: { [STATUS_ID]: "Tracked", [GONE]: "stale" } }] as never);
    db.knowledgePage.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...rowPage(ROW_ID, "Alert latency", null), properties: args.data.properties })) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const row = await caller.database.updateRow({
      rowId: ROW_ID,
      values: { Name: "Alert latency (p95)", Status: "Instrumenting" },
      note: "Renamed after the review",
    });
    const data = db.knowledgePage.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.properties).toEqual({ [STATUS_ID]: "Instrumenting" });
    expect(data.title).toBe("Alert latency (p95)");
    expect(row.values).toEqual({ [STATUS_ID]: "Instrumenting" });
    expect(db.knowledgePageRevision.create.mock.calls[0]![0].data).toMatchObject({
      kind: "properties",
      authorId: OWNER,
      note: "Renamed after the review",
    });
  });

  it("updateRow merges against the row as it is under the lock, not the snapshot read before the transaction", async () => {
    const NOTES = "pnotes000001";
    const withNotes = databaseRow({
      properties: [
        { id: TITLE_ID, name: "Name", type: "title" },
        { id: STATUS_ID, name: "Status", type: "text" },
        { id: NOTES, name: "Notes", type: "text" },
      ],
    });
    // The pre-transaction read saw no Notes; a concurrent writer set one before our lock.
    db.knowledgePage.findUnique.mockResolvedValue(
      rowFull({ properties: { [STATUS_ID]: "Tracked" }, database: withNotes }) as never,
    );
    db.$queryRaw.mockResolvedValue([{ properties: { [STATUS_ID]: "Tracked", [NOTES]: "set meanwhile" } }] as never);
    db.knowledgePage.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...rowPage(ROW_ID, "Alert latency", null), properties: args.data.properties })) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const row = await caller.database.updateRow({ rowId: ROW_ID, values: { Status: "Instrumenting" } });
    expect(row.values).toEqual({ [STATUS_ID]: "Instrumenting", [NOTES]: "set meanwhile" });
    // A tagged-template `$queryRaw` call: the strings array, then the bound values.
    const [strings, ...bound] = db.$queryRaw.mock.calls[0]! as unknown as [readonly string[], ...unknown[]];
    expect(strings.join("?")).toContain("FOR UPDATE");
    expect(bound).toEqual([ROW_ID]);
  });

  it("updateRow clears a cell on null, rejects a bad value naming the property, and viewers cannot write", async () => {
    db.$queryRaw.mockResolvedValue([{ properties: { [STATUS_ID]: "Tracked" } }] as never);
    db.knowledgePage.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...rowPage(ROW_ID, "Alert latency", null), properties: args.data.properties })) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const cleared = await caller.database.updateRow({ rowId: ROW_ID, values: { Status: null } });
    expect(cleared.values).toEqual({});

    const error = await failureOf(caller.database.updateRow({ rowId: ROW_ID, values: { Status: 3 } }));
    expect(error?.code).toBe("BAD_REQUEST");
    expect(error?.message).toBe('Property "Status" expects text, got a number');

    install(db, "viewer");
    db.knowledgePage.findUnique.mockResolvedValue(rowFull() as never);
    const viewer = createMockCaller({ userId: MEMBER, db });
    await expect(viewer.database.updateRow({ rowId: ROW_ID, values: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateRow on a page that is not a row is refused", async () => {
    db.knowledgePage.findUnique.mockResolvedValue({ ...pageRow(), database: null } as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(caller.database.updateRow({ rowId: PAGE_ID, values: {} })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("deleteRow deletes the page and clears its chunks", async () => {
    db.knowledgePage.delete.mockResolvedValue(rowFull() as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.deleteRow({ rowId: ROW_ID });
    expect(result).toEqual({ id: ROW_ID, databaseId: DB_ID });
    expect(db.knowledgePage.delete).toHaveBeenCalledWith({ where: { id: ROW_ID } });
    expect(clearPageChunks).toHaveBeenCalledWith(ROW_ID);
    expect(triggerPageEmbedding).toHaveBeenCalledWith(PAGE_ID);
  });
});

describe("the block's lifecycle: detach, re-attach, delete, list", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    clearPageChunksMany.mockReset();
    install(db);
    db.pageDatabase.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 } as never);
    db.pageLink.deleteMany.mockResolvedValue({ count: 0 } as never);
  });

  it("an editor save without the node detaches the database; a save with it re-attaches", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const without = { type: "doc", content: [{ type: "paragraph" }] };
    await caller.page.update({ id: PAGE_ID, bodyDoc: without, body: "", baseVersion: 3 });
    expect(db.pageDatabase.updateMany).toHaveBeenCalledWith({
      where: { pageId: PAGE_ID, detachedAt: null },
      data: { detachedAt: expect.any(Date) as Date },
    });

    db.pageDatabase.updateMany.mockClear();
    const withNode = { type: "doc", content: [{ type: "database", attrs: { databaseId: DB_ID } }] };
    await caller.page.update({ id: PAGE_ID, bodyDoc: withNode, body: databaseMarker(DB_ID), baseVersion: 3 });
    expect(db.pageDatabase.updateMany).toHaveBeenCalledWith({
      where: { pageId: PAGE_ID, id: { in: [DB_ID] }, detachedAt: { not: null } },
      data: { detachedAt: null },
    });
  });

  it("a Markdown write (the CLI) keeps the block by its marker and detaches a database whose marker is gone", async () => {
    db.knowledgePage.update.mockResolvedValue(pageRow() as never);
    const caller = createMockCaller({ userId: OWNER, db, tokenType: "api-token" });
    await caller.page.update({ id: PAGE_ID, body: `# New body

${databaseMarker(DB_ID)}` });
    expect(db.pageDatabase.updateMany).toHaveBeenNthCalledWith(1, {
      where: { pageId: PAGE_ID, detachedAt: null, id: { notIn: [DB_ID] } },
      data: { detachedAt: expect.any(Date) as Date },
    });

    // A body read expanded and written back is stored as its marker alone.
    db.knowledgePage.update.mockClear();
    await caller.page.update({
      id: PAGE_ID,
      body: `# Round trip\n\n${databaseMarker(DB_ID)}\n\n| Name | Status |\n| --- | --- |\n| Alert latency | Tracked |\n\nClosing.`,
    });
    const written = db.knowledgePage.update.mock.calls[0]![0].data as { body?: string };
    expect(written.body).toBe(`# Round trip\n\n${databaseMarker(DB_ID)}\n\nClosing.`);

    db.pageDatabase.updateMany.mockClear();
    await caller.page.update({ id: PAGE_ID, body: "# Body with no block" });
    expect(db.pageDatabase.updateMany).toHaveBeenCalledWith({
      where: { pageId: PAGE_ID, detachedAt: null },
      data: { detachedAt: expect.any(Date) as Date },
    });
  });

  it("database.delete needs edit access, deletes the database and clears its rows' chunks", async () => {
    db.knowledgePage.findMany.mockResolvedValue([{ id: "row-1" }, { id: "row-2" }] as never);
    db.pageDatabase.delete.mockResolvedValue(databaseRow() as never);
    const owner = createMockCaller({ userId: OWNER, db });
    await expect(owner.database.delete({ id: DB_ID })).resolves.toEqual({ id: DB_ID, rowCount: 2 });
    expect(db.pageDatabase.delete).toHaveBeenCalledWith({ where: { id: DB_ID } });
    expect(clearPageChunksMany).toHaveBeenCalledWith(["row-1", "row-2"]);

    install(db, "viewer");
    const viewer = createMockCaller({ userId: MEMBER, db });
    await expect(viewer.database.delete({ id: DB_ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("database.list shows a page's databases, detached ones included, with row counts", async () => {
    const detachedAt = new Date("2026-10-20T00:00:00Z");
    db.pageDatabase.findMany.mockResolvedValue([
      { ...databaseRow(), _count: { rows: 3 } },
      { ...databaseRow({ id: "db-2", name: "Problems", detachedAt }), _count: { rows: 1 } },
    ] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const list = await caller.database.list({ pageId: PAGE_ID });
    expect(list.map((d) => [d.id, d.name, d.rowCount, d.detachedAt])).toEqual([
      [DB_ID, "Metrics", 3, null],
      ["db-2", "Problems", 1, detachedAt],
    ]);
    expect(list[0]!.marker).toBe(databaseMarker(DB_ID));
    expect((db.pageDatabase.findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({ pageId: PAGE_ID });
  });
});

describe("rows publish and unpublish with the holding page (ADR-0078 §4)", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    install(db);
    db.knowledgePage.findUniqueOrThrow.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve({ title: args.where.id === PAGE_ID ? "Data strategy" : "Alert latency", publicId: null, publicSlug: null })) as never);
    db.knowledgePage.update.mockImplementation(((args: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ id: args.where.id, isPublic: true, publicId: "pub", publicSlug: "s", publicSeoIndexed: false, publishedAt: new Date() })) as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 2 } as never);
  });

  it("publish mints a public id for the page and for every row of its databases", async () => {
    db.knowledgePage.findMany.mockResolvedValue([{ id: "row-1" }, { id: "row-2" }] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.publish({ id: PAGE_ID });
    const published = db.knowledgePage.update.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(published).toEqual([PAGE_ID, "row-1", "row-2"]);
    // Only rows of attached databases: a removed block's retained rows stay private.
    const rowsWhere = db.knowledgePage.findMany.mock.calls[0]![0] as { where: unknown };
    expect(rowsWhere.where).toEqual({ database: { pageId: PAGE_ID, detachedAt: null } });
  });

  it("unpublish takes the rows dark first, then the page", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.page.unpublish({ id: PAGE_ID });
    expect(db.knowledgePage.updateMany).toHaveBeenCalledWith({
      where: { database: { pageId: PAGE_ID } },
      data: { isPublic: false },
    });
    expect(db.knowledgePage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAGE_ID }, data: { isPublic: false } }),
    );
  });
});

describe("page.get expands a database marker", () => {
  const db = getDbMock();
  beforeEach(() => {
    mockReset(db);
    install(db);
    db.$queryRaw.mockResolvedValue([rowPage("row-1", "Alert latency", "Tracked")] as never);
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

  it("person cells show names, resolved in one user query", async () => {
    const OWNER_ID = "powner000001";
    db.pageDatabase.findMany.mockResolvedValue([
      databaseRow({
        properties: [
          { id: TITLE_ID, name: "Name", type: "title" },
          { id: OWNER_ID, name: "Owner", type: "person" },
        ],
        view: { filters: [], hiddenPropertyIds: [], propertyOrder: [TITLE_ID, OWNER_ID] },
      }),
    ] as never);
    db.$queryRaw.mockResolvedValue([
      { ...rowPage("row-1", "Alert latency", null), properties: { [OWNER_ID]: ["u-ana", "u-gone"] } },
    ] as never);
    db.user.findMany.mockResolvedValue([{ id: "u-ana", name: "Ana", email: "ana@x.y" }] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, format: "markdown" });
    expect(page.body).toContain("| [Alert latency](/w/acme/pages/row-1) | Ana, u-gone |");
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("projects through the saved view and says how many rows it left out", async () => {
    db.pageDatabase.findMany.mockResolvedValue([
      databaseRow({ view: { sort: { propertyId: TITLE_ID, direction: "asc" }, filters: [], hiddenPropertyIds: [], propertyOrder: [] } }),
    ] as never);
    const many = Array.from({ length: 201 }, (_, i) => rowPage(`row-${i}`, `Row ${i}`, null));
    db.$queryRaw.mockResolvedValue(many as never);
    db.knowledgePage.count.mockResolvedValue(260);
    const caller = createMockCaller({ userId: OWNER, db });
    const page = await caller.page.get({ id: PAGE_ID, format: "markdown" });
    const q = db.$queryRaw.mock.calls[0]![0] as unknown as { text: string; values: unknown[] };
    expect(q.text).toContain('ORDER BY "title" ASC NULLS LAST');
    expect(q.values).toEqual([DB_ID, 201, 0]);
    expect(page.body).toContain("| [Row 199](/w/acme/pages/row-199) |");
    expect(page.body).not.toContain("Row 200");
    expect(page.body).toContain("_60 more rows not shown._");
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

describe("relations (ADR-0078 §5): edges both ways, the reverse column, resolved targets", () => {
  const db = getDbMock();
  const TARGET_DB = "db-2";
  const TARGET_PAGE = "page-2";
  const PROBLEMS_ID = "pproblems001";
  const REVERSE_ID = "preverse0001";
  const ROW_ID = "row-1";
  const problemsDef = {
    id: PROBLEMS_ID,
    name: "Problems",
    type: "relation",
    relation: { targetKind: "ROW", targetDatabaseId: TARGET_DB, many: true },
  };
  const reverseDef = {
    id: REVERSE_ID,
    name: "Metrics",
    type: "relation",
    relation: {
      targetKind: "ROW",
      targetDatabaseId: DB_ID,
      inverseOf: { databaseId: DB_ID, propertyId: PROBLEMS_ID },
      many: true,
    },
  };
  const metricsWithProblems = () =>
    databaseRow({
      properties: [
        { id: TITLE_ID, name: "Name", type: "title" },
        { id: STATUS_ID, name: "Status", type: "text" },
        problemsDef,
      ],
    });
  const problemsDatabase = (overrides: Record<string, unknown> = {}) =>
    databaseRow({
      id: TARGET_DB,
      pageId: TARGET_PAGE,
      name: "Problems",
      properties: [{ id: "ptitle000002", name: "Name", type: "title" }, reverseDef],
      view: { filters: [], hiddenPropertyIds: [], propertyOrder: [] },
      titlePropertyId: "ptitle000002",
      page: { ...databaseRow().page, id: TARGET_PAGE, title: "Problem register" },
      ...overrides,
    });
  const rowOfMetrics = () =>
    pageRow({
      id: ROW_ID,
      title: "Alert latency",
      databaseId: DB_ID,
      properties: { [STATUS_ID]: "Tracked" },
      database: metricsWithProblems(),
    });
  type UpdateCall = { where: { id: string }; data: { properties?: { id: string; name: string; relation?: unknown }[] } };
  const updates = () => db.pageDatabase.update.mock.calls.map((c) => c[0] as unknown as UpdateCall);

  beforeEach(() => {
    mockReset(db);
    install(db);
    db.pageDatabase.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === TARGET_DB ? problemsDatabase() : metricsWithProblems())) as never);
    db.pageDatabase.update.mockImplementation(((args: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ ...(args.where.id === TARGET_DB ? problemsDatabase() : metricsWithProblems()), ...args.data })) as never);
    db.databaseRelation.findMany.mockResolvedValue([] as never);
    db.databaseRelation.count.mockResolvedValue(0);
  });

  it("addProperty with a ROW relation adds the column here and a reverse column on the related database, in one transaction", async () => {
    // Metrics has no relation yet in this case.
    db.pageDatabase.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === TARGET_DB ? problemsDatabase({ properties: [{ id: "ptitle000002", name: "Name", type: "title" }] }) : databaseRow())) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.addProperty({
      id: DB_ID,
      name: "Problems",
      type: "relation",
      relation: { targetKind: "ROW", targetDatabaseId: TARGET_DB },
    });
    expect(result.property).toMatchObject({ type: "relation", relation: { targetKind: "ROW", targetDatabaseId: TARGET_DB, many: true } });
    const [forward, reverse] = updates();
    expect(forward!.where.id).toBe(DB_ID);
    expect(reverse!.where.id).toBe(TARGET_DB);
    const added = reverse!.data.properties!.at(-1)!;
    // Named after the source database, pointing back, and marked as the inverse.
    expect(added).toMatchObject({
      name: "Metrics",
      type: "relation",
      relation: { targetKind: "ROW", targetDatabaseId: DB_ID, inverseOf: { databaseId: DB_ID, propertyId: result.property.id }, many: true },
    });
    expect(result.reverse).toEqual({ databaseId: TARGET_DB, property: added });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // Both holding pages re-index: each has a new column.
    expect(triggerPageEmbedding).toHaveBeenCalledWith(PAGE_ID);
    expect(triggerPageEmbedding).toHaveBeenCalledWith(TARGET_PAGE);
  });

  it("addProperty refuses a relation without a target, a target in another workspace, a target on a non-relation, and makes a self-relation one-way", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await expect(caller.database.addProperty({ id: DB_ID, name: "Links", type: "relation" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.database.addProperty({ id: DB_ID, name: "Links", type: "text", relation: { targetKind: "ROW", targetDatabaseId: TARGET_DB } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    db.pageDatabase.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === TARGET_DB ? problemsDatabase({ workspaceId: "ws-2" }) : databaseRow())) as never);
    await expect(
      caller.database.addProperty({ id: DB_ID, name: "Links", type: "relation", relation: { targetKind: "ROW", targetDatabaseId: TARGET_DB } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("same workspace") as string });
    expect(db.pageDatabase.update).not.toHaveBeenCalled();

    const self = await caller.database.addProperty({
      id: DB_ID,
      name: "Depends on",
      type: "relation",
      relation: { targetKind: "ROW", targetDatabaseId: DB_ID, many: false },
    });
    expect(self.reverse).toBeNull();
    expect(updates()).toHaveLength(1);
    expect(self.property.relation?.many).toBe(false);
  });

  it("updateRow writes a relation cell as edges — replaced here, mirrored on the reverse column — and returns the targets resolved", async () => {
    db.knowledgePage.findUnique.mockResolvedValue(rowOfMetrics() as never);
    db.$queryRaw.mockResolvedValue([{ properties: { [STATUS_ID]: "Tracked" } }] as never);
    db.knowledgePage.findMany.mockResolvedValue([{ id: "q1" }, { id: "q2" }] as never);
    db.knowledgePage.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...rowPage(ROW_ID, "Alert latency", "Tracked"), properties: args.data.properties })) as never);
    db.databaseRelation.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    db.databaseRelation.findMany.mockResolvedValue([
      { rowPageId: ROW_ID, propertyId: PROBLEMS_ID, targetKind: "ROW", targetId: "q1", targetRowPage: { id: "q1", title: "Gaps" } },
      { rowPageId: ROW_ID, propertyId: PROBLEMS_ID, targetKind: "ROW", targetId: "q2", targetRowPage: { id: "q2", title: "" } },
    ] as never);

    const caller = createMockCaller({ userId: OWNER, db });
    const row = await caller.database.updateRow({ rowId: ROW_ID, values: { Problems: "q1, q2, q1" } });

    // Targets are checked against the related database.
    expect(db.knowledgePage.findMany.mock.calls[0]![0]).toMatchObject({ where: { id: { in: ["q1", "q2"] }, databaseId: TARGET_DB } });
    // Forward edges: the old ones go, the new ones come in order.
    expect(db.databaseRelation.deleteMany.mock.calls[0]![0]).toEqual({ where: { rowPageId: ROW_ID, propertyId: PROBLEMS_ID } });
    expect(db.databaseRelation.createMany.mock.calls[0]![0]).toEqual({
      data: [
        { databaseId: DB_ID, propertyId: PROBLEMS_ID, rowPageId: ROW_ID, targetKind: "ROW", targetId: "q1", targetRowPageId: "q1", position: 0 },
        { databaseId: DB_ID, propertyId: PROBLEMS_ID, rowPageId: ROW_ID, targetKind: "ROW", targetId: "q2", targetRowPageId: "q2", position: 1 },
      ],
    });
    // Inverse edges: those that pointed at this row go; one is appended on each target.
    expect(db.databaseRelation.deleteMany.mock.calls[1]![0]).toEqual({
      where: { databaseId: TARGET_DB, propertyId: REVERSE_ID, targetRowPageId: ROW_ID },
    });
    expect(db.databaseRelation.create.mock.calls.map((c) => c[0].data)).toEqual([
      { databaseId: TARGET_DB, propertyId: REVERSE_ID, rowPageId: "q1", targetKind: "ROW", targetId: ROW_ID, targetRowPageId: ROW_ID, position: 2 },
      { databaseId: TARGET_DB, propertyId: REVERSE_ID, rowPageId: "q2", targetKind: "ROW", targetId: ROW_ID, targetRowPageId: ROW_ID, position: 0 },
    ]);
    // Nothing of it in the values column; the row comes back with its targets resolved.
    const data = db.knowledgePage.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.properties).toEqual({ [STATUS_ID]: "Tracked" });
    expect(row.relations[PROBLEMS_ID]).toEqual([
      { kind: "ROW", id: "q1", title: "Gaps", href: "/w/acme/pages/q1" },
      { kind: "ROW", id: "q2", title: "Untitled", href: "/w/acme/pages/q2" },
    ]);
    expect(db.knowledgePageRevision.create.mock.calls[0]![0].data).toMatchObject({ kind: "properties" });
  });

  it("updateRow refuses a target that is not a row of the related database, naming the property, and writes no edge", async () => {
    db.knowledgePage.findUnique.mockResolvedValue(rowOfMetrics() as never);
    db.$queryRaw.mockResolvedValue([{ properties: {} }] as never);
    db.knowledgePage.findMany.mockResolvedValue([{ id: "q1" }] as never);
    db.knowledgePage.update.mockResolvedValue(rowPage(ROW_ID, "Alert latency", null) as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const error = await failureOf(caller.database.updateRow({ rowId: ROW_ID, values: { Problems: ["q1", "nope"] } }));
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining('"Problems"') as string });
    expect(db.databaseRelation.createMany).not.toHaveBeenCalled();
  });

  it("listRows carries each row's relations, resolved in one query, empty lists where a row has none", async () => {
    db.$queryRaw.mockResolvedValue([rowPage(ROW_ID, "Alert latency", "Tracked"), rowPage("row-2", "Coverage", null)] as never);
    db.databaseRelation.findMany.mockResolvedValue([
      { rowPageId: ROW_ID, propertyId: PROBLEMS_ID, targetKind: "ROW", targetId: "q1", targetRowPage: { id: "q1", title: "Gaps" } },
    ] as never);
    const caller = createMockCaller({ userId: MEMBER, db });
    const page = await caller.database.listRows({ id: DB_ID });
    expect(db.databaseRelation.findMany).toHaveBeenCalledTimes(1);
    expect(db.databaseRelation.findMany.mock.calls[0]![0]).toMatchObject({
      where: { rowPageId: { in: [ROW_ID, "row-2"] }, propertyId: { in: [PROBLEMS_ID] } },
    });
    expect(page.rows[0]!.relations).toEqual({ [PROBLEMS_ID]: [{ kind: "ROW", id: "q1", title: "Gaps", href: `/w/acme/pages/q1` }] });
    expect(page.rows[1]!.relations).toEqual({ [PROBLEMS_ID]: [] });
  });

  it("addProperty with a native kind makes a one-way relation: no target database, no reverse column", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.addProperty({
      id: DB_ID,
      name: "Ticket",
      type: "relation",
      relation: { targetKind: "TICKET", many: false },
    });
    expect(result.property.relation).toEqual({ targetKind: "TICKET", many: false });
    expect(result.reverse).toBeNull();
    expect(updates()).toHaveLength(1);
    await expect(
      caller.database.addProperty({ id: DB_ID, name: "Odd", type: "relation", relation: { targetKind: "GOAL", targetDatabaseId: TARGET_DB } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("updateRow with a native target checks it lives in the workspace (a Ticket through its Product) and writes a plain edge", async () => {
    const TICKET_PROP = "pticket00001";
    const withTicket = databaseRow({
      properties: [
        { id: TITLE_ID, name: "Name", type: "title" },
        { id: TICKET_PROP, name: "Ticket", type: "relation", relation: { targetKind: "TICKET", many: false } },
      ],
    });
    db.knowledgePage.findUnique.mockResolvedValue(pageRow({ id: ROW_ID, databaseId: DB_ID, properties: {}, database: withTicket }) as never);
    db.$queryRaw.mockResolvedValue([{ properties: {} }] as never);
    db.ticket.findMany
      .mockResolvedValueOnce([{ id: "t1" }] as never)
      .mockResolvedValueOnce([{ id: "t1", title: "Fix Okta callback", status: "IN_PROGRESS", product: { slug: "clear" } }] as never);
    db.knowledgePage.update.mockResolvedValue(rowPage(ROW_ID, "Alert latency", null) as never);
    db.databaseRelation.findMany.mockResolvedValue([
      { rowPageId: ROW_ID, propertyId: TICKET_PROP, targetKind: "TICKET", targetId: "t1", targetRowPage: null },
    ] as never);
    const caller = createMockCaller({ userId: OWNER, db });
    const row = await caller.database.updateRow({ rowId: ROW_ID, values: { Ticket: "t1" } });
    expect(db.ticket.findMany.mock.calls[0]![0]).toMatchObject({ where: { id: { in: ["t1"] }, product: { workspaceId: WORKSPACE_ID } } });
    expect(db.databaseRelation.createMany.mock.calls[0]![0]).toEqual({
      data: [{ databaseId: DB_ID, propertyId: TICKET_PROP, rowPageId: ROW_ID, targetKind: "TICKET", targetId: "t1", targetRowPageId: null, position: 0 }],
    });
    // No reverse side to keep in step.
    expect(db.pageDatabase.findUnique).toHaveBeenCalledTimes(0);
    expect(row.relations[TICKET_PROP]).toEqual([
      { kind: "TICKET", id: "t1", title: "Fix Okta callback", status: "IN_PROGRESS", href: "/w/acme/products/clear/tickets/t1" },
    ]);

    // Two targets on a single-valued relation, or one from another workspace, are refused naming the property.
    await expect(caller.database.updateRow({ rowId: ROW_ID, values: { Ticket: ["t1", "t2"] } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("one target") as string,
    });
    db.ticket.findMany.mockResolvedValueOnce([] as never);
    await expect(caller.database.updateRow({ rowId: ROW_ID, values: { Ticket: "t-elsewhere" } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("not in this workspace") as string,
    });
  });

  it("listRows resolves native targets to their live title and status, one query per kind, and marks a vanished one (deleted)", async () => {
    const KR = "pkr000000001";
    const GOAL = "pgoal0000001";
    const withNatives = databaseRow({
      properties: [
        { id: TITLE_ID, name: "Name", type: "title" },
        { id: KR, name: "Key result", type: "relation", relation: { targetKind: "KEY_RESULT", many: true } },
        { id: GOAL, name: "Goal", type: "relation", relation: { targetKind: "GOAL", many: true } },
      ],
    });
    db.pageDatabase.findUnique.mockResolvedValue(withNatives as never);
    db.$queryRaw.mockResolvedValue([rowPage(ROW_ID, "Alert latency", null)] as never);
    db.databaseRelation.findMany.mockResolvedValue([
      { rowPageId: ROW_ID, propertyId: KR, targetKind: "KEY_RESULT", targetId: "kr1", targetRowPage: null },
      { rowPageId: ROW_ID, propertyId: KR, targetKind: "KEY_RESULT", targetId: "kr-gone", targetRowPage: null },
      { rowPageId: ROW_ID, propertyId: GOAL, targetKind: "GOAL", targetId: "12", targetRowPage: null },
    ] as never);
    db.keyResult.findMany.mockResolvedValue([{ id: "kr1", title: "p95 under 2s", status: "on-track", goalId: 12 }] as never);
    db.goal.findMany.mockResolvedValue([{ id: 12, title: "Faster alerts", status: "active" }] as never);
    const caller = createMockCaller({ userId: MEMBER, db });
    const page = await caller.database.listRows({ id: DB_ID });
    expect(db.keyResult.findMany).toHaveBeenCalledTimes(1);
    expect(db.goal.findMany.mock.calls[0]![0]).toMatchObject({ where: { id: { in: [12] } } });
    expect(page.rows[0]!.relations).toEqual({
      [KR]: [
        { kind: "KEY_RESULT", id: "kr1", title: "p95 under 2s", status: "on-track", href: "/w/acme/goals/12" },
        { kind: "KEY_RESULT", id: "kr-gone", title: "(deleted)", deleted: true },
      ],
      [GOAL]: [{ kind: "GOAL", id: "12", title: "Faster alerts", status: "active", href: "/w/acme/goals/12" }],
    });
    // Nothing on a native entity is ever written through a database.
    expect(db.keyResult.update).not.toHaveBeenCalled();
    expect(db.goal.update).not.toHaveBeenCalled();
  });

  it("searchTargets offers rows of the related database, or workspace entities of the kind, by title", async () => {
    db.knowledgePage.findMany.mockResolvedValue([{ id: "q1", title: "Gaps" }, { id: "q2", title: "" }] as never);
    const caller = createMockCaller({ userId: MEMBER, db });
    const rows = await caller.database.searchTargets({ id: DB_ID, propertyId: PROBLEMS_ID, query: "ga" });
    expect(db.knowledgePage.findMany.mock.calls[0]![0]).toMatchObject({
      where: { databaseId: TARGET_DB, title: { contains: "ga", mode: "insensitive" } },
      take: 20,
    });
    expect(rows).toEqual([
      { kind: "ROW", id: "q1", title: "Gaps", href: "/w/acme/pages/q1" },
      { kind: "ROW", id: "q2", title: "Untitled", href: "/w/acme/pages/q2" },
    ]);

    const TICKET_PROP = "pticket00001";
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({
        properties: [
          { id: TITLE_ID, name: "Name", type: "title" },
          { id: TICKET_PROP, name: "Ticket", type: "relation", relation: { targetKind: "TICKET", many: false } },
        ],
      }) as never,
    );
    db.ticket.findMany.mockResolvedValue([{ id: "t1", title: "Fix Okta callback", status: "QA", product: { slug: "clear" } }] as never);
    const tickets = await caller.database.searchTargets({ id: DB_ID, propertyId: "Ticket" });
    expect(db.ticket.findMany.mock.calls[0]![0]).toMatchObject({ where: { product: { workspaceId: WORKSPACE_ID } } });
    expect(tickets).toEqual([{ kind: "TICKET", id: "t1", title: "Fix Okta callback", status: "QA", href: "/w/acme/products/clear/tickets/t1" }]);
    await expect(caller.database.searchTargets({ id: DB_ID, propertyId: TITLE_ID })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("removeProperty on a two-way relation removes its edges and the reverse column on the other database, from either side", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.database.removeProperty({ id: DB_ID, propertyId: PROBLEMS_ID });
    expect(db.databaseRelation.deleteMany.mock.calls.map((c) => c[0])).toEqual([
      { where: { databaseId: DB_ID, propertyId: PROBLEMS_ID } },
      { where: { databaseId: TARGET_DB, propertyId: REVERSE_ID } },
    ]);
    const [here, there] = updates();
    expect(here!.where.id).toBe(DB_ID);
    expect(here!.data.properties!.map((p) => p.id)).toEqual([TITLE_ID, STATUS_ID]);
    expect(there!.where.id).toBe(TARGET_DB);
    expect(there!.data.properties!.map((p) => p.id)).toEqual(["ptitle000002"]);
    expect(triggerPageEmbedding).toHaveBeenCalledWith(TARGET_PAGE);

    // From the reverse side, the forward column goes too.
    db.databaseRelation.deleteMany.mockClear();
    db.pageDatabase.update.mockClear();
    await caller.database.removeProperty({ id: TARGET_DB, propertyId: REVERSE_ID });
    expect(db.databaseRelation.deleteMany.mock.calls.map((c) => c[0])).toEqual([
      { where: { databaseId: TARGET_DB, propertyId: REVERSE_ID } },
      { where: { databaseId: DB_ID, propertyId: PROBLEMS_ID } },
    ]);
    expect(updates().map((u) => u.where.id)).toEqual([TARGET_DB, DB_ID]);
  });

  it("removeProperty on a native relation drops its edges and nothing else; a scalar removal touches no edge", async () => {
    const TICKET_PROP = "pticket00001";
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({
        properties: [
          { id: TITLE_ID, name: "Name", type: "title" },
          { id: STATUS_ID, name: "Status", type: "text" },
          { id: TICKET_PROP, name: "Ticket", type: "relation", relation: { targetKind: "TICKET", many: false } },
        ],
      }) as never,
    );
    const caller = createMockCaller({ userId: OWNER, db });
    await caller.database.removeProperty({ id: DB_ID, propertyId: TICKET_PROP });
    expect(db.databaseRelation.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.databaseRelation.deleteMany.mock.calls[0]![0]).toEqual({ where: { databaseId: DB_ID, propertyId: TICKET_PROP } });
    expect(updates()).toHaveLength(1);
    await caller.database.removeProperty({ id: DB_ID, propertyId: STATUS_ID });
    expect(db.databaseRelation.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("listInWorkspace lists attached databases of the workspace through the page access clause", async () => {
    db.pageDatabase.findMany.mockResolvedValue([
      { id: DB_ID, name: "Metrics", page: { id: PAGE_ID, title: "Data strategy" } },
    ] as never);
    const caller = createMockCaller({ userId: MEMBER, db });
    expect(await caller.database.listInWorkspace({ workspaceId: WORKSPACE_ID })).toEqual([
      { id: DB_ID, name: "Metrics", page: { id: PAGE_ID, title: "Data strategy" } },
    ]);
    const where = db.pageDatabase.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ workspaceId: WORKSPACE_ID, detachedAt: null });
    expect(where.page).toBeDefined();
  });
});

describe("CSV import (ADR-0078, V4): previewCsv and commitCsv", () => {
  const db = getDbMock();
  const SCORE_ID = "pscore000001";
  const withScore = () =>
    databaseRow({
      properties: [
        { id: TITLE_ID, name: "Name", type: "title" },
        { id: STATUS_ID, name: "Status", type: "text" },
        { id: SCORE_ID, name: "Score", type: "number" },
      ],
      view: { filters: [], hiddenPropertyIds: [], propertyOrder: [TITLE_ID, STATUS_ID, SCORE_ID] },
    });
  const csv = ["Name,Score,Owner", "Alert latency,7,Ana", "Coverage,lots,Ben", "Uptime,,"].join("\n");

  beforeEach(() => {
    mockReset(db);
    install(db);
    triggerPageEmbedding.mockClear();
    db.pageDatabase.findUnique.mockImplementation((() => Promise.resolve(withScore())) as never);
    db.pageDatabase.update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...withScore(), ...args.data })) as never);
    let n = 0;
    db.knowledgePage.create.mockImplementation((() => Promise.resolve({ id: `row-${++n}` })) as never);
  });

  it("previewCsv suggests a mapping by header name, types every row and names the cell that does not fit; viewers may preview", async () => {
    const caller = createMockCaller({ userId: MEMBER, db });
    db.workspaceUser.findUnique.mockResolvedValue({ role: "viewer", workspaceId: WORKSPACE_ID } as never);
    const preview = await caller.database.previewCsv({ id: DB_ID, csv });
    expect(preview.mapping).toEqual({
      Name: { kind: "property", propertyId: TITLE_ID },
      Score: { kind: "property", propertyId: SCORE_ID },
      Owner: { kind: "new", name: "Owner", type: "text" },
    });
    expect(preview.columns.map((c) => [c.header, c.propertyName, c.type])).toEqual([
      ["Name", "Name", "title"],
      ["Score", "Score", "number"],
      ["Owner", "Owner", "text"],
    ]);
    expect(preview.total).toBe(3);
    expect(preview.importable).toBe(2);
    expect(preview.rows[1]!.errors).toEqual([{ header: "Score", propertyName: "Score", reason: 'expects a number, got "lots"' }]);
    expect(db.knowledgePage.create).not.toHaveBeenCalled();
    // A mapping that does not fit is refused whole.
    await expect(
      caller.database.previewCsv({ id: DB_ID, csv, mapping: { Name: { kind: "property", propertyId: "nope" } } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("commitCsv mints the new column, creates only the rows with no error (each with a create revision), and re-indexes the holder once", async () => {
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.commitCsv({
      id: DB_ID,
      csv,
      mapping: {
        Name: { kind: "property", propertyId: TITLE_ID },
        Score: { kind: "property", propertyId: SCORE_ID },
        Owner: { kind: "new", name: "Owner", type: "text" },
      },
      note: "From the Q3 sheet",
    });
    const owner = result.properties[0]!;
    expect(owner).toMatchObject({ name: "Owner", type: "text" });
    expect(owner.id).toHaveLength(12);
    const definition = db.pageDatabase.update.mock.calls[0]![0].data as { properties: { id: string }[]; view: { propertyOrder: string[] } };
    expect(definition.properties.map((p) => p.id)).toEqual([TITLE_ID, STATUS_ID, SCORE_ID, owner.id]);
    expect(definition.view.propertyOrder).toEqual([TITLE_ID, STATUS_ID, SCORE_ID, owner.id]);

    expect(result.created).toEqual(["row-1", "row-2"]);
    expect(result.skipped).toEqual([{ index: 1, errors: [{ header: "Score", propertyName: "Score", reason: 'expects a number, got "lots"' }] }]);
    const creates = db.knowledgePage.create.mock.calls.map((c) => c[0].data as Record<string, unknown>);
    expect(creates[0]).toMatchObject({ title: "Alert latency", databaseId: DB_ID, properties: { [SCORE_ID]: 7, [owner.id]: "Ana" }, workspaceId: WORKSPACE_ID, createdById: OWNER });
    // An empty cell is left out, not stored as null.
    expect(creates[1]).toMatchObject({ title: "Uptime", properties: {} });
    expect(db.knowledgePageRevision.create).toHaveBeenCalledTimes(2);
    expect(db.knowledgePageRevision.create.mock.calls[0]![0].data).toMatchObject({ kind: "create", note: "From the Q3 sheet" });
    // The holding page once, each row once.
    expect(triggerPageEmbedding.mock.calls.map((c) => c[0])).toEqual([PAGE_ID, "row-1", "row-2"]);
  });

  it("previewCsv resolves person emails to workspace members and reports the options a select column lacks", async () => {
    const PERSON_ID = "pperson00001";
    const SELECT_ID = "pselect00001";
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({
        properties: [
          { id: TITLE_ID, name: "Name", type: "title" },
          { id: PERSON_ID, name: "Owner", type: "person" },
          { id: SELECT_ID, name: "Stage", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
        ],
      }) as never,
    );
    db.workspaceUser.findMany.mockResolvedValue([{ userId: "u-ana", user: { email: "ana@acme.io" } }] as never);
    const caller = createMockCaller({ userId: MEMBER, db });
    const preview = await caller.database.previewCsv({
      id: DB_ID,
      csv: ["Name,Owner,Stage", "A,Ana@acme.io,Tracked", "B,nobody@acme.io,Dropped", "C,u-ben,dropped"].join("\n"),
    });
    expect(db.workspaceUser.findMany.mock.calls[0]![0]).toMatchObject({ where: { workspaceId: WORKSPACE_ID } });
    expect(preview.rows[0]!.values).toEqual({ [PERSON_ID]: ["u-ana"], [SELECT_ID]: "o_tr" });
    expect(preview.rows[1]!.errors).toEqual([{ header: "Owner", propertyName: "Owner", reason: 'names a person who is not in this workspace: "nobody@acme.io"' }]);
    expect(preview.rows[2]!.values).toEqual({ [PERSON_ID]: ["u-ben"], [SELECT_ID]: "dropped" });
    expect(preview.newOptions).toEqual({ [SELECT_ID]: ["Dropped"] });
    expect(preview.importable).toBe(2);
  });

  it("commitCsv creates the options a select column lacks — on an existing property and on a new one — and stores ids, not names", async () => {
    const SELECT_ID = "pselect00001";
    db.pageDatabase.findUnique.mockResolvedValue(
      databaseRow({
        properties: [
          { id: TITLE_ID, name: "Name", type: "title" },
          { id: SELECT_ID, name: "Stage", type: "select", options: [{ id: "o_tr", name: "Tracked", color: "green" }] },
        ],
        view: { filters: [], hiddenPropertyIds: [], propertyOrder: [TITLE_ID, SELECT_ID] },
      }) as never,
    );
    const caller = createMockCaller({ userId: OWNER, db });
    const result = await caller.database.commitCsv({
      id: DB_ID,
      csv: ["Name,Stage,Tags", "A,Tracked,x;y", "B,Dropped,y"].join("\n"),
      mapping: {
        Name: { kind: "property", propertyId: TITLE_ID },
        Stage: { kind: "property", propertyId: SELECT_ID },
        Tags: { kind: "new", name: "Tags", type: "multiSelect" },
      },
    });
    const definition = db.pageDatabase.update.mock.calls[0]![0].data as { properties: { id: string; name: string; options?: { id: string; name: string }[] }[] };
    const stage = definition.properties.find((p) => p.id === SELECT_ID)!;
    expect(stage.options!.map((o) => o.name)).toEqual(["Tracked", "Dropped"]);
    const dropped = stage.options![1]!;
    expect(dropped.id).toHaveLength(12);
    const tags = definition.properties.find((p) => p.name === "Tags")!;
    expect(tags.options!.map((o) => o.name)).toEqual(["x", "y"]);
    expect(result.properties.map((p) => p.name)).toEqual(["Tags"]);
    const creates = db.knowledgePage.create.mock.calls.map((c) => (c[0].data as { properties: Record<string, unknown> }).properties);
    expect(creates[0]).toEqual({ [SELECT_ID]: "o_tr", [tags.id]: [tags.options![0]!.id, tags.options![1]!.id] });
    expect(creates[1]).toEqual({ [SELECT_ID]: dropped.id, [tags.id]: [tags.options![1]!.id] });
  });

  it("commitCsv needs edit access and refuses a file past the row cap", async () => {
    const mapping = { Name: { kind: "property" as const, propertyId: TITLE_ID } };
    db.workspaceUser.findUnique.mockResolvedValue({ role: "viewer", workspaceId: WORKSPACE_ID } as never);
    await expect(createMockCaller({ userId: MEMBER, db }).database.commitCsv({ id: DB_ID, csv, mapping })).rejects.toMatchObject({ code: "FORBIDDEN" });
    db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: WORKSPACE_ID } as never);
    const big = ["Name", ...Array.from({ length: 2001 }, (_, i) => `Row ${i}`)].join("\n");
    await expect(createMockCaller({ userId: OWNER, db }).database.commitCsv({ id: DB_ID, csv: big, mapping })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("2000") as string,
    });
    expect(db.knowledgePage.create).not.toHaveBeenCalled();
  });
});
