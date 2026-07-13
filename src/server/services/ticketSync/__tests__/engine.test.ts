/**
 * Engine-seam tests for the inbound ticket sync (prior art: mastraNotion.test).
 *
 * The engine is driven with a plain fake {@link TicketSyncRemoteAdapter} and a
 * deep-mocked PrismaClient — no network, no DB. Ticket creation and the tag
 * helpers are module-mocked so assertions stay on the engine's outcomes:
 * which tickets it creates/updates, what it snapshots, and what the run
 * manifest reports.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { createTicketMock, resolveTagsMock, attachTagsMock } = vi.hoisted(() => ({
  createTicketMock: vi.fn(),
  resolveTagsMock: vi.fn(),
  attachTagsMock: vi.fn(),
}));

vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: createTicketMock,
}));

vi.mock("../../notionTicketImport", () => ({
  resolveOrCreateWorkspaceTags: resolveTagsMock,
  attachTicketTags: attachTagsMock,
}));

import {
  runInboundTicketSync,
  type RemoteTicketRow,
  type TicketSyncRemoteAdapter,
} from "../engine";
import type { SyncedFields } from "../merge";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const CONFIG = {
  id: "cfg1",
  productId: "prod1",
  provider: "notion",
  integrationId: "int1",
  databaseId: "db1",
  databaseName: "Backlog",
  enabled: true,
  pushEnabled: false,
  statusMap: null,
  propertyNames: null,
  lastPulledAt: null,
  createdById: "user1",
  createdAt: new Date(),
  updatedAt: new Date(),
  product: { id: "prod1", workspaceId: "ws1" },
};

function row(overrides: Partial<RemoteTicketRow> = {}): RemoteTicketRow {
  return {
    externalId: "page-1",
    url: "https://notion.so/page-1",
    title: "Imported row",
    rawStatus: "In Progress",
    rawPriority: "1 - High",
    rawType: "Bug",
    rawEffort: "L (5pts)",
    labels: [],
    lastEditedAt: new Date("2026-07-10T10:00:00Z"),
    lastEditedByBot: false,
    archived: false,
    ...overrides,
  };
}

function fakeAdapter(rows: RemoteTicketRow[]): TicketSyncRemoteAdapter & {
  queryCalls: Array<{ databaseId: string; editedAfter?: Date }>;
} {
  const queryCalls: Array<{ databaseId: string; editedAfter?: Date }> = [];
  return {
    queryCalls,
    queryRows: (params) => {
      queryCalls.push(params);
      return Promise.resolve(rows);
    },
    getPageBody: () => Promise.resolve("Body from Notion"),
  };
}

function snapshotFor(overrides: Partial<SyncedFields> = {}): SyncedFields {
  return {
    title: "Imported row",
    status: "IN_PROGRESS",
    priority: 1,
    type: "BUG",
    points: 5,
    labels: [],
    cycleName: null,
    assigneeEmail: null,
    ...overrides,
  };
}

const LINKED_TICKET = {
  id: "t1",
  title: "Imported row",
  status: "IN_PROGRESS" as const,
  type: "BUG" as const,
  priority: 1,
  points: 5,
  updatedAt: new Date("2026-07-09T10:00:00Z"),
};

beforeEach(() => {
  mockReset(db);
  createTicketMock.mockReset();
  resolveTagsMock.mockReset();
  attachTagsMock.mockReset();

  db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue(CONFIG as never);
  db.ticketSyncRun.create.mockResolvedValue({ id: "run1" } as never);
  db.ticketSyncRun.update.mockResolvedValue({} as never);
  db.ticketSyncConfig.update.mockResolvedValue({} as never);
  db.ticket.findMany.mockResolvedValue([]);
  db.ticketSync.findMany.mockResolvedValue([]);
  db.ticketSync.create.mockResolvedValue({} as never);
  db.ticketSync.update.mockResolvedValue({} as never);
  createTicketMock.mockResolvedValue({ id: "new-ticket" });
  resolveTagsMock.mockResolvedValue(["tag1"]);
  attachTagsMock.mockResolvedValue(undefined);
});

describe("runInboundTicketSync — creation", () => {
  it("creates a ticket for an unseen row with mapped fields and provenance", async () => {
    const result = await runInboundTicketSync(db, fakeAdapter([row()]), {
      configId: "cfg1",
      trigger: "manual",
    });

    expect(createTicketMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        productId: "prod1",
        workspaceId: "ws1",
        createdById: "user1",
        title: "Imported row",
        status: "IN_PROGRESS",
        type: "BUG",
        priority: 1,
        points: 5,
        body: "Body from Notion",
        links: { notion: "https://notion.so/page-1", notionPageId: "page-1" },
      }),
    );
    expect(db.ticketSync.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          configId: "cfg1",
          ticketId: "new-ticket",
          externalId: "page-1",
          snapshot: expect.objectContaining({ status: "IN_PROGRESS" }),
        }),
      }),
    );
    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("attaches the row's labels as workspace tags", async () => {
    await runInboundTicketSync(db, fakeAdapter([row({ labels: ["urgent"] })]), {
      configId: "cfg1",
      trigger: "manual",
    });
    expect(resolveTagsMock).toHaveBeenCalledWith(db, {
      workspaceId: "ws1",
      userId: "user1",
      names: ["urgent"],
    });
    expect(attachTagsMock).toHaveBeenCalledWith(db, "new-ticket", ["tag1"]);
  });
});

describe("runInboundTicketSync — adoption", () => {
  it("adopts a pre-existing ticket via links.notionPageId without duplicating it", async () => {
    db.ticket.findMany.mockResolvedValue([
      { id: "t1", title: "Imported row", links: { notionPageId: "page-1" } },
    ] as never);
    // After adoption the record exists for the row pass.
    db.ticketSync.findMany.mockResolvedValue([
      {
        id: "s1",
        ticketId: "t1",
        externalId: "page-1",
        snapshot: null,
        tombstonedAt: null,
      },
    ] as never);
    db.ticket.findUnique.mockResolvedValue(LINKED_TICKET as never);

    const result = await runInboundTicketSync(db, fakeAdapter([row()]), {
      configId: "cfg1",
      trigger: "manual",
    });

    expect(db.ticketSync.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ticketId: "t1", externalId: "page-1" }),
      }),
    );
    expect(createTicketMock).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.items.some((i) => i.action === "adopted")).toBe(true);
  });
});

describe("runInboundTicketSync — updates and idempotency", () => {
  function linkRecord(snapshot: SyncedFields | null) {
    db.ticketSync.findMany.mockResolvedValue([
      {
        id: "s1",
        ticketId: "t1",
        externalId: "page-1",
        snapshot,
        tombstonedAt: null,
      },
    ] as never);
  }

  it("applies a remote-only change to the ticket and advances the snapshot", async () => {
    linkRecord(snapshotFor());
    db.ticket.findUnique.mockResolvedValue(LINKED_TICKET as never);

    const result = await runInboundTicketSync(
      db,
      fakeAdapter([row({ rawStatus: "Done" })]),
      { configId: "cfg1", trigger: "manual" },
    );

    expect(db.ticket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "DONE" },
    });
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ status: "DONE" }),
        }),
      }),
    );
    expect(result.updated).toBe(1);
  });

  it("is idempotent: an unchanged row produces zero ticket writes", async () => {
    linkRecord(snapshotFor());
    db.ticket.findUnique.mockResolvedValue(LINKED_TICKET as never);

    const result = await runInboundTicketSync(db, fakeAdapter([row()]), {
      configId: "cfg1",
      trigger: "manual",
    });

    expect(db.ticket.update).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
    expect(result.items.some((i) => i.reason === "in sync")).toBe(true);
  });

  it("keeps a pending local edit out of the snapshot so push can find it later", async () => {
    // Local retitled the ticket; remote unchanged. Inbound-only must neither
    // write the ticket nor advance the snapshot past the remote's value.
    linkRecord(snapshotFor());
    db.ticket.findUnique.mockResolvedValue({
      ...LINKED_TICKET,
      title: "Locally retitled",
    } as never);

    await runInboundTicketSync(db, fakeAdapter([row()]), {
      configId: "cfg1",
      trigger: "manual",
    });

    expect(db.ticket.update).not.toHaveBeenCalled();
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          // Base stays at the remote's title, keeping the local edit pending.
          snapshot: expect.objectContaining({ title: "Imported row" }),
        }),
      }),
    );
  });

  it("resolves a same-field two-sided change by last write wins and reports it", async () => {
    linkRecord(snapshotFor({ status: "BACKLOG" }));
    // Local moved BACKLOG→IN_PROGRESS at T-old; remote moved BACKLOG→Done later.
    db.ticket.findUnique.mockResolvedValue({
      ...LINKED_TICKET,
      updatedAt: new Date("2026-07-09T10:00:00Z"),
    } as never);

    const result = await runInboundTicketSync(
      db,
      fakeAdapter([
        row({ rawStatus: "Done", lastEditedAt: new Date("2026-07-10T10:00:00Z") }),
      ]),
      { configId: "cfg1", trigger: "manual" },
    );

    expect(db.ticket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "DONE" },
    });
    expect(result.conflicts).toBe(1);
    expect(result.items.some((i) => i.action === "conflict")).toBe(true);
  });
});

describe("runInboundTicketSync — skips", () => {
  it("skips rows in the Notion trash", async () => {
    const result = await runInboundTicketSync(
      db,
      fakeAdapter([row({ archived: true })]),
      { configId: "cfg1", trigger: "manual" },
    );
    expect(createTicketMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("skips rows last edited by our own bot (echo suppression)", async () => {
    const result = await runInboundTicketSync(
      db,
      fakeAdapter([row({ lastEditedByBot: true })]),
      { configId: "cfg1", trigger: "manual" },
    );
    expect(createTicketMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.items[0]!.reason).toContain("echo");
  });
});

describe("runInboundTicketSync — dry run", () => {
  it("writes nothing anywhere but returns the full manifest", async () => {
    db.ticket.findMany.mockResolvedValue([
      { id: "t9", title: "Old import", links: { notionPageId: "page-9" } },
    ] as never);

    const result = await runInboundTicketSync(
      db,
      fakeAdapter([row(), row({ externalId: "page-2", title: "Second row" })]),
      { configId: "cfg1", trigger: "manual", dryRun: true },
    );

    expect(createTicketMock).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
    expect(db.ticketSync.create).not.toHaveBeenCalled();
    expect(db.ticketSync.update).not.toHaveBeenCalled();
    expect(db.ticketSyncConfig.update).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.created).toBe(2);
    expect(result.items.filter((i) => i.action === "adopted")).toHaveLength(1);
    // The run record itself IS persisted (dry runs are auditable).
    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "success" }),
      }),
    );
  });
});

describe("runInboundTicketSync — windowing and failures", () => {
  it("passes lastPulledAt as the incremental window and advances it on success", async () => {
    const pulledAt = new Date("2026-07-01T00:00:00Z");
    db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue({
      ...CONFIG,
      lastPulledAt: pulledAt,
    } as never);
    const adapter = fakeAdapter([]);

    await runInboundTicketSync(db, adapter, {
      configId: "cfg1",
      trigger: "cron",
    });

    expect(adapter.queryCalls[0]).toEqual({
      databaseId: "db1",
      editedAfter: pulledAt,
    });
    expect(db.ticketSyncConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastPulledAt: expect.any(Date) },
      }),
    );
  });

  it("marks the run as errored and rethrows when the adapter fails", async () => {
    const adapter: TicketSyncRemoteAdapter = {
      queryRows: () => Promise.reject(new Error("Notion is down")),
    };

    await expect(
      runInboundTicketSync(db, adapter, { configId: "cfg1", trigger: "cron" }),
    ).rejects.toThrow("Notion is down");

    expect(db.ticketSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "error",
          error: "Notion is down",
        }),
      }),
    );
  });

  it("continues past a row that fails and reports it", async () => {
    createTicketMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ id: "new-ticket-2" });

    const result = await runInboundTicketSync(
      db,
      fakeAdapter([row(), row({ externalId: "page-2", title: "Second row" })]),
      { configId: "cfg1", trigger: "manual" },
    );

    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.items.some((i) => i.action === "failed" && i.reason === "boom")).toBe(true);
  });
});
