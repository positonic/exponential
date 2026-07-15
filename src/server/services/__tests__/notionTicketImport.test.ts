/**
 * Contract tests for the agent-facing cycle import after its repoint onto the
 * sync engine: same request/response shape as the Mastra tool has always
 * consumed, but internally one cycle-scoped engine run. The engine, adapter
 * factory, and credential resolution are module-mocked; Prisma is deep-mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { searchMock, getPageWithBlocksMock, resolveServiceMock, runSyncMock, adapterFactoryMock } =
  vi.hoisted(() => ({
    searchMock: vi.fn(),
    getPageWithBlocksMock: vi.fn(),
    resolveServiceMock: vi.fn(),
    runSyncMock: vi.fn(),
    adapterFactoryMock: vi.fn(),
  }));

vi.mock("../notionAgentService", () => ({
  NotionAgentService: class {
    resolveService = resolveServiceMock;
  },
}));

vi.mock("../ticketSync/engine", () => ({
  runInboundTicketSync: runSyncMock,
}));

vi.mock("../ticketSync/notionAdapter", () => ({
  createNotionTicketSyncAdapter: adapterFactoryMock,
}));

import { importNotionCycleTickets } from "../notionTicketImport";
import type { InboundSyncResult } from "../ticketSync/engine";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const PARAMS = {
  userId: "user1",
  workspaceId: "ws1",
  productId: "prod1",
  notionDatabaseId: "db1",
  cycleName: "Cycle 11",
};

const CONFIG = {
  id: "cfg1",
  productId: "prod1",
  provider: "notion",
  integrationId: "int1",
  databaseId: "db1",
  propertyNames: null,
};

function runResult(overrides: Partial<InboundSyncResult> = {}): InboundSyncResult {
  return {
    runId: "run1",
    dryRun: false,
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    archived: 0,
    failed: 0,
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  searchMock.mockReset();
  getPageWithBlocksMock.mockReset();
  resolveServiceMock.mockReset();
  runSyncMock.mockReset();
  adapterFactoryMock.mockReset();

  resolveServiceMock.mockResolvedValue({
    connected: true,
    service: { search: searchMock, getPageWithBlocks: getPageWithBlocksMock },
  });
  searchMock.mockResolvedValue({
    results: [{ id: "cycle-page-1", title: "Cycle 11", url: "https://notion.so/c11" }],
  });
  adapterFactoryMock.mockResolvedValue({ ok: true, adapter: {} });
  runSyncMock.mockResolvedValue(runResult());
  db.ticketSyncConfig.findUnique.mockResolvedValue(CONFIG as never);
  db.ticketSyncConfig.create.mockResolvedValue(CONFIG as never);
  db.integration.findFirst.mockResolvedValue({ id: "int1" } as never);
  db.ticket.findMany.mockResolvedValue([]);
  db.list.findFirst.mockResolvedValue(null);
  db.tag.findFirst.mockResolvedValue({ id: "tag1" } as never);
  db.ticketTag.createMany.mockResolvedValue({ count: 1 } as never);
});

describe("importNotionCycleTickets (engine delegation)", () => {
  it("returns {connected:false} when the user has no Notion connection", async () => {
    resolveServiceMock.mockResolvedValue({ connected: false });
    expect(await importNotionCycleTickets(db, PARAMS)).toEqual({ connected: false });
  });

  it("returns candidates when the cycle title is ambiguous", async () => {
    searchMock.mockResolvedValue({
      results: [
        { id: "a", title: "Cycle 11", url: "u1" },
        { id: "b", title: "Cycle 11", url: "u2" },
      ],
    });
    const result = await importNotionCycleTickets(db, PARAMS);
    expect(result).toMatchObject({
      connected: true,
      error: expect.stringContaining("Multiple"),
    });
    expect(runSyncMock).not.toHaveBeenCalled();
  });

  it("runs the engine cycle-scoped with the agent trigger", async () => {
    await importNotionCycleTickets(db, PARAMS);
    expect(runSyncMock).toHaveBeenCalledWith(db, expect.anything(), {
      configId: "cfg1",
      trigger: "agent",
      dryRun: false,
      scope: { relationProperty: "Cycles", relationContains: "cycle-page-1" },
    });
  });

  it("creates a standing sync config when the product has none", async () => {
    db.ticketSyncConfig.findUnique.mockResolvedValue(null);

    const result = await importNotionCycleTickets(db, {
      ...PARAMS,
      relationProperty: "Sprint",
      properties: { status: "State" },
    });

    expect(db.ticketSyncConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "prod1",
          integrationId: "int1",
          databaseId: "db1",
          propertyNames: expect.objectContaining({ status: "State", cycle: "Sprint" }),
        }),
      }),
    );
    expect(result).toMatchObject({ connected: true });
    if ("warnings" in result) {
      expect(result.warnings.join(" ")).toContain("standing Notion sync link");
    }
  });

  it("maps the run manifest into the tool contract and applies agent labels", async () => {
    runSyncMock.mockResolvedValue(
      runResult({
        created: 1,
        skipped: 1,
        updated: 1,
        failed: 1,
        items: [
          { externalId: "p1", ticketId: "t1", title: "New one", action: "created" },
          { externalId: "p2", ticketId: "t2", title: "Existing", action: "skipped", reason: "in sync" },
          { externalId: "p3", ticketId: "t3", title: "Changed", action: "updated", reason: "set status" },
          { externalId: "p4", ticketId: null, title: "Broken", action: "failed", reason: "boom" },
          { externalId: null, ticketId: "t9", title: "Old import", action: "adopted", reason: "linked" },
        ],
      }),
    );
    db.ticket.findMany.mockResolvedValue([
      { id: "t1", number: 7, shortId: "wild.fox", title: "New one", status: "BACKLOG" },
    ] as never);

    const result = await importNotionCycleTickets(db, PARAMS);
    if (!("totalFound" in result)) throw new Error("expected success result");

    expect(result.created).toEqual([
      { id: "t1", number: 7, shortId: "wild.fox", title: "New one", status: "BACKLOG", warnings: [] },
    ]);
    expect(result.skipped).toEqual([
      { title: "Existing", reason: "in sync" },
      { title: "Changed", reason: "updated: set status" },
    ]);
    expect(result.failed).toEqual([{ title: "Broken", error: "boom" }]);
    // Adopted items are product-wide bookkeeping, not cycle rows.
    expect(result.totalFound).toBe(4);
    // FROM-NOTION default label attached to the created ticket.
    expect(db.ticketTag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ ticketId: "t1", tagId: "tag1" }],
      }),
    );
  });

  it("dry run maps previews and writes no labels", async () => {
    runSyncMock.mockResolvedValue(
      runResult({
        dryRun: true,
        created: 1,
        items: [
          {
            externalId: "p1",
            ticketId: null,
            title: "New one",
            action: "created",
            reason: "would create ticket",
            preview: {
              status: "IN_PROGRESS",
              type: "BUG",
              priority: 1,
              points: 5,
              labels: ["urgent"],
              url: "https://notion.so/p1",
            },
          },
        ],
      }),
    );

    const result = await importNotionCycleTickets(db, { ...PARAMS, dryRun: true });
    if (!("totalFound" in result)) throw new Error("expected success result");

    expect(result.preview).toEqual([
      {
        title: "New one",
        status: "IN_PROGRESS",
        type: "BUG",
        priority: 1,
        points: 5,
        notionUrl: "https://notion.so/p1",
        labels: ["FROM-NOTION"],
        warnings: ["would create ticket"],
      },
    ]);
    expect(db.ticketTag.createMany).not.toHaveBeenCalled();
    expect(runSyncMock).toHaveBeenCalledWith(
      db,
      expect.anything(),
      expect.objectContaining({ dryRun: true }),
    );
  });

  it("warns when the standing sync is linked to a different database", async () => {
    db.ticketSyncConfig.findUnique.mockResolvedValue({
      ...CONFIG,
      databaseId: "other-db",
    } as never);

    const result = await importNotionCycleTickets(db, PARAMS);
    if (!("totalFound" in result)) throw new Error("expected success result");
    expect(result.warnings.join(" ")).toContain("different Notion database");
  });

  it("surfaces a broken credential as a contract error", async () => {
    adapterFactoryMock.mockResolvedValue({ ok: false, error: "No access token" });
    const result = await importNotionCycleTickets(db, PARAMS);
    expect(result).toEqual({ connected: true, error: "No access token" });
  });
});
