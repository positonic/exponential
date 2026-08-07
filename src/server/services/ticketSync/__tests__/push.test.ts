/**
 * Engine-seam tests for the outbound push (prior art: engine.test.ts).
 *
 * `runOutboundTicketPush` is driven with a plain fake {@link TicketPushAdapter}
 * and a deep-mocked PrismaClient — no network, no DB. Assertions stay on the
 * engine's outcomes: what it writes to Notion, how it advances the snapshot,
 * and the run item it returns.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma } from "@prisma/client";
import type { PrismaClient, TicketStatus, TicketType } from "@prisma/client";

const { createTicketMock, resolveTagsMock, attachTagsMock, recordActivityMock } =
  vi.hoisted(() => ({
    createTicketMock: vi.fn(),
    resolveTagsMock: vi.fn(),
    attachTagsMock: vi.fn(),
    recordActivityMock: vi.fn(),
  }));

vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: createTicketMock,
}));
vi.mock("../../notionTicketImport", () => ({
  resolveOrCreateWorkspaceTags: resolveTagsMock,
  attachTicketTags: attachTagsMock,
}));
vi.mock("~/server/services/activity/recordActivity", () => ({
  recordActivity: recordActivityMock,
}));

import {
  runOutboundTicketPush,
  NonRetryablePushError,
  type TicketPushAdapter,
} from "../push";
import { runInboundTicketSync, type RemoteTicketRow } from "../engine";
import type { SyncedFields } from "../merge";
import type { NotionDbSchema } from "../outboundMapping";

const db = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

const SCHEMA: NotionDbSchema = {
  Name: { type: "title", options: [] },
  Status: { type: "status", options: ["Backlog", "In Progress", "QA", "Done"] },
  Priority: { type: "select", options: ["0 - Critical", "1 - High", "2 - Medium"] },
  Type: { type: "select", options: ["Bug", "Feature", "Chore"] },
  Effort: { type: "number", options: [] },
  Label: { type: "multi_select", options: [] },
  Cycles: { type: "relation", options: [] },
  Assignee: { type: "people", options: [] },
  Source: { type: "select", options: [] },
  "Exponential URL": { type: "url", options: [] },
};

function snapshotFor(overrides: Partial<SyncedFields> = {}): SyncedFields {
  return {
    title: "Title",
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

const TICKET = {
  id: "t1",
  title: "Title",
  body: "Ticket body." as string | null,
  number: 42,
  status: "IN_PROGRESS" as TicketStatus,
  type: "BUG" as TicketType,
  priority: 1,
  points: 5,
  updatedAt: new Date("2026-07-10T10:00:00Z"),
  cycle: null as { name: string } | null,
  assignee: null as { email: string | null } | null,
  tags: [] as { tag: { name: string } }[],
};

function remoteRow(overrides: Partial<RemoteTicketRow> = {}): RemoteTicketRow {
  return {
    externalId: "page-1",
    url: "https://notion.so/page-1",
    title: "Title",
    rawStatus: "In Progress",
    rawPriority: "1 - High",
    rawType: "Bug",
    rawEffort: "5 pts",
    labels: [],
    cycleName: null,
    assigneeEmail: null,
    lastEditedAt: new Date("2026-07-09T10:00:00Z"),
    lastEditedByBot: false,
    archived: false,
    ...overrides,
  };
}

function syncRecord(
  overrides: {
    snapshot?: SyncedFields | null;
    tombstonedAt?: Date | null;
    externalId?: string;
    config?: Partial<{
      pushEnabled: boolean;
      integrationId: string | null;
      statusMap: unknown;
    }>;
    ticket?: Partial<typeof TICKET>;
  } = {},
) {
  return {
    id: "s1",
    ticketId: "t1",
    externalId: overrides.externalId ?? "page-1",
    snapshot: overrides.snapshot === undefined ? snapshotFor() : overrides.snapshot,
    tombstonedAt: overrides.tombstonedAt ?? null,
    config: {
      id: "cfg1",
      databaseId: "db1",
      pushEnabled: overrides.config?.pushEnabled ?? true,
      integrationId:
        overrides.config?.integrationId === undefined
          ? "int1"
          : overrides.config.integrationId,
      statusMap: overrides.config?.statusMap ?? null,
      propertyNames: null,
      product: {
        workspaceId: "ws1",
        slug: "prod",
        workspace: { slug: "ws" },
      },
    },
    ticket: { ...TICKET, ...overrides.ticket },
  };
}

interface FakeAdapter extends TicketPushAdapter {
  updates: Array<{ id: string; props: Record<string, unknown> }>;
  creates: Array<{
    databaseId: string;
    titleProperty: string | null;
    properties: Record<string, unknown>;
    children: unknown[];
  }>;
  archives: string[];
}

function fakeAdapter(
  row: RemoteTicketRow | null,
  opts: {
    cyclePageId?: string | null;
    personId?: string | null;
    schema?: NotionDbSchema;
    /** Same-titled rows the pre-create duplicate probe should find. */
    pagesByTitle?: Array<{ externalId: string; url: string | null }>;
  } = {},
): FakeAdapter {
  const updates: FakeAdapter["updates"] = [];
  const creates: FakeAdapter["creates"] = [];
  const archives: string[] = [];
  return {
    updates,
    creates,
    archives,
    getRow: () => Promise.resolve(row),
    getWriteSchema: () => Promise.resolve(opts.schema ?? SCHEMA),
    updatePage: (id, props) => {
      updates.push({ id, props });
      return Promise.resolve();
    },
    findCyclePageIdByName: () => Promise.resolve(opts.cyclePageId ?? null),
    findPersonIdByEmail: () => Promise.resolve(opts.personId ?? null),
    findPagesByTitle: () => Promise.resolve(opts.pagesByTitle ?? []),
    createPage: (params) => {
      creates.push(params);
      return Promise.resolve({ externalId: "new-page-id", url: "https://notion.so/new" });
    },
    archivePage: (id) => {
      archives.push(id);
      return Promise.resolve();
    },
  };
}

beforeEach(() => {
  mockReset(db);
  db.ticketSync.update.mockResolvedValue({} as never);
  db.ticketSync.delete.mockResolvedValue({} as never);
});

describe("runOutboundTicketPush — toggle guard", () => {
  it("writes nothing when push is disabled (engine-seam guard)", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ config: { pushEnabled: false } }) as never,
    );
    const adapter = fakeAdapter(remoteRow());

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(item.reason).toContain("push disabled");
    expect(adapter.updates).toHaveLength(0);
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the connection is disconnected", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ config: { integrationId: null } }) as never,
    );
    const adapter = fakeAdapter(remoteRow());

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(adapter.updates).toHaveLength(0);
  });
});

describe("runOutboundTicketPush — writes", () => {
  it("pushes a local title change and advances the snapshot", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { title: "New title" } }) as never,
    );
    const adapter = fakeAdapter(remoteRow({ title: "Title" }));

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates[0]!.props.Name).toEqual({
      title: [{ text: { content: "New title" } }],
    });
    expect(item.action).toBe("pushed");
    expect(item.wrote).toContain("title");
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ title: "New title" }),
        }),
      }),
    );
  });

  it("pushes a status change using the sticky-collapse option", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { status: "QA" } }) as never,
    );
    const adapter = fakeAdapter(remoteRow({ rawStatus: "In Progress" }));

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates[0]!.props.Status).toEqual({ status: { name: "QA" } });
    expect(item.action).toBe("pushed");
  });

  it("resolves a cycle to a Notion page when one exists", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { cycle: { name: "Cycle 12" } } }) as never,
    );
    const adapter = fakeAdapter(remoteRow({ cycleName: null }), {
      cyclePageId: "cycle-page-9",
    });

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates[0]!.props.Cycles).toEqual({
      relation: [{ id: "cycle-page-9" }],
    });
    expect(item.wrote).toContain("cycleName");
  });

  it("skips the cycle with a warning when no Notion cycle page matches", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { cycle: { name: "Cycle 12" } } }) as never,
    );
    const adapter = fakeAdapter(remoteRow({ cycleName: null }), {
      cyclePageId: null,
    });

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates).toHaveLength(0);
    expect(item.reason).toContain("no Notion cycle page");
    // Skipped field pins the snapshot to the REMOTE value → stays pending
    // outbound (retried next push), never reverted by the inbound poll.
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ cycleName: null }),
        }),
      }),
    );
  });

  it("assigns by email when a Notion member matches", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { assignee: { email: "dev@example.com" } } }) as never,
    );
    const adapter = fakeAdapter(remoteRow({ assigneeEmail: null }), {
      personId: "person-3",
    });

    await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates[0]!.props.Assignee).toEqual({
      people: [{ id: "person-3" }],
    });
  });
});

describe("runOutboundTicketPush — conflicts (LWW)", () => {
  it("local wins a two-sided conflict and pushes the local value", async () => {
    // base IN_PROGRESS; local→DONE at a newer time; remote→QA earlier.
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({
        snapshot: snapshotFor({ status: "IN_PROGRESS" }),
        ticket: { status: "DONE", updatedAt: new Date("2026-07-11T00:00:00Z") },
      }) as never,
    );
    const adapter = fakeAdapter(
      remoteRow({ rawStatus: "QA", lastEditedAt: new Date("2026-07-10T00:00:00Z") }),
    );

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates[0]!.props.Status).toEqual({ status: { name: "Done" } });
    expect(item.action).toBe("conflict");
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ status: "DONE" }),
        }),
      }),
    );
  });

  it("remote wins a two-sided conflict — no Notion write, left to the poll", async () => {
    // base IN_PROGRESS; local→DONE at an OLDER time; remote→QA later.
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({
        snapshot: snapshotFor({ status: "IN_PROGRESS" }),
        ticket: { status: "DONE", updatedAt: new Date("2026-07-09T00:00:00Z") },
      }) as never,
    );
    const adapter = fakeAdapter(
      remoteRow({ rawStatus: "QA", lastEditedAt: new Date("2026-07-11T00:00:00Z") }),
    );

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates).toHaveLength(0);
    expect(item.action).toBe("conflict");
    // No DB write either — the inbound poll owns applying the remote win.
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });
});

describe("runOutboundTicketPush — unmapped field", () => {
  it("skips a status with no Notion option and pins the snapshot to remote", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({
        snapshot: snapshotFor({ status: "IN_PROGRESS" }),
        ticket: { status: "NEEDS_REFINEMENT" },
      }) as never,
    );
    // Database has no option that maps to NEEDS_REFINEMENT.
    const adapter = fakeAdapter(remoteRow({ rawStatus: "In Progress" }));

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(adapter.updates).toHaveLength(0);
    expect(item.action).toBe("skipped");
    expect(item.reason).toContain("no Notion status option");
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ status: "IN_PROGRESS" }),
        }),
      }),
    );
  });
});

describe("runOutboundTicketPush — missing page", () => {
  it("skips when the Notion page no longer exists", async () => {
    db.ticketSync.findUnique.mockResolvedValue(syncRecord({ ticket: { title: "X" } }) as never);
    const adapter = fakeAdapter(null);

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(item.reason).toContain("no longer exists");
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });
});

describe("runOutboundTicketPush — idempotency / ping-pong", () => {
  it("is a no-op when local, snapshot and remote already agree", async () => {
    db.ticketSync.findUnique.mockResolvedValue(syncRecord() as never);
    const adapter = fakeAdapter(remoteRow());

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(adapter.updates).toHaveLength(0);
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });

  it("push then poll produces zero writes in either direction", async () => {
    // 1. Push a local title change. Snapshot advances to the local value.
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { title: "New title" } }) as never,
    );
    const pushAdapter = fakeAdapter(remoteRow({ title: "Title" }));
    await runOutboundTicketPush(db, pushAdapter, { syncId: "s1" });

    const advancedSnapshot = (
      db.ticketSync.update.mock.calls[0]![0] as {
        data: { snapshot: SyncedFields };
      }
    ).data.snapshot;
    expect(advancedSnapshot.title).toBe("New title");

    // 2. The next inbound poll sees the page we just wrote: its value equals
    //    the advanced snapshot AND it was last edited by our bot. Either alone
    //    suppresses the echo; assert zero ticket/notion writes.
    mockReset(db);
    db.ticketSyncConfig.findUniqueOrThrow.mockResolvedValue({
      id: "cfg1",
      productId: "prod1",
      provider: "notion",
      integrationId: "int1",
      databaseId: "db1",
      databaseName: "Backlog",
      enabled: true,
      pushEnabled: true,
      statusMap: null,
      propertyNames: null,
      lastPulledAt: null,
      createdById: "user1",
      createdAt: new Date(),
      updatedAt: new Date(),
      product: { id: "prod1", workspaceId: "ws1" },
    } as never);
    db.ticketSyncRun.create.mockResolvedValue({ id: "run1" } as never);
    db.ticketSyncRun.update.mockResolvedValue({} as never);
    db.ticketSyncConfig.update.mockResolvedValue({} as never);
    db.ticket.findMany.mockResolvedValue([]);
    db.ticketSync.findMany.mockResolvedValue([
      {
        id: "s1",
        ticketId: "t1",
        externalId: "page-1",
        snapshot: advancedSnapshot,
        tombstonedAt: null,
      },
    ] as never);
    db.ticket.findUnique.mockResolvedValue({
      ...TICKET,
      title: "New title",
    } as never);

    const pollAdapter = {
      queryRows: () =>
        Promise.resolve([
          remoteRow({ title: "New title", lastEditedByBot: true }),
        ]),
      getPageBody: () => Promise.resolve(null),
    };

    const result = await runInboundTicketSync(db, pollAdapter, {
      configId: "cfg1",
      trigger: "cron",
    });

    expect(db.ticket.update).not.toHaveBeenCalled();
    expect(createTicketMock).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });
});

describe("runOutboundTicketPush — full-mirror creation", () => {
  it("creates a Notion page for a sentinel link and stores the real page id", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({
        snapshot: null,
        // sentinel externalId = mirror not yet created
        externalId: "pending:t1",
      }) as never,
    );
    const adapter = fakeAdapter(null);

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("created");
    expect(item.externalId).toBe("new-page-id");
    expect(adapter.creates).toHaveLength(1);
    // Title, status, Source marker and back-link URL all in the payload.
    const props = adapter.creates[0]!.properties;
    expect(props.Name).toEqual({ title: [{ text: { content: "Title" } }] });
    expect(props.Source).toEqual({ select: { name: "Exponential" } });
    expect(props["Exponential URL"]).toEqual({
      url: "https://www.exponential.im/w/ws/products/prod/tickets/42",
    });
    // Body copied as page content (callout back-link + a paragraph).
    expect(adapter.creates[0]!.children.length).toBeGreaterThanOrEqual(2);
    // Sentinel rewritten to the real page id + converged snapshot.
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({
          externalId: "new-page-id",
          snapshot: expect.objectContaining({ title: "Title" }),
          // Provenance: the ONLY signal that this page's content is
          // machine-authored and may later be rewritten in place. Without it
          // the body-repair pass cannot tell our pages from imported ones.
          remoteCreatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("fails terminally when the link write dies after the page was created", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const adapter = fakeAdapter(null);
    db.ticketSync.update.mockRejectedValueOnce(new Error("connection lost"));

    // The Notion page is already live; retrying would create a second one, so
    // this must surface as non-retryable rather than as an ordinary failure.
    const error = await runOutboundTicketPush(db, adapter, {
      syncId: "s1",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NonRetryablePushError);
    expect((error as NonRetryablePushError).orphanedExternalId).toBe("new-page-id");
    // One page created, and the sentinel still stands — the orphan an operator
    // has to reconcile. The point is that a retry cannot add a second.
    expect(adapter.creates).toHaveLength(1);
  });

  it("does not mirror a terminal ticket and drops the sentinel", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1", ticket: { status: "DONE" } }) as never,
    );
    const adapter = fakeAdapter(null);

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(adapter.creates).toHaveLength(0);
    expect(db.ticketSync.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("warns but still creates when the database has no Source property", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const schemaNoSource: NotionDbSchema = { ...SCHEMA };
    delete schemaNoSource.Source;
    const adapter = fakeAdapter(null, { schema: schemaNoSource });

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("created");
    expect(item.reason).toContain('no "Source" property');
    expect(adapter.creates[0]!.properties.Source).toBeUndefined();
  });

  it("dry run previews a creation without writing", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const adapter = fakeAdapter(null);

    const item = await runOutboundTicketPush(db, adapter, {
      syncId: "s1",
      dryRun: true,
    });

    expect(item.action).toBe("created");
    expect(item.reason).toContain("would create");
    expect(adapter.creates).toHaveLength(0);
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });
});

describe("runOutboundTicketPush — pre-create duplicate probe", () => {
  beforeEach(() => {
    db.ticketSync.findMany.mockResolvedValue([] as never);
  });

  it("adopts the existing same-titled row instead of creating a second one", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const adapter = fakeAdapter(null, {
      pagesByTitle: [{ externalId: "page-9", url: "https://notion.so/page-9" }],
    });

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("adopted");
    expect(item.externalId).toBe("page-9");
    expect(adapter.creates).toHaveLength(0);
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({
          externalId: "page-9",
          externalUrl: "https://notion.so/page-9",
        }),
      }),
    );
  });

  it("adopts without claiming authorship of the page body", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const adapter = fakeAdapter(null, {
      pagesByTitle: [{ externalId: "page-9", url: null }],
    });

    await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    // `remoteCreatedAt` is what licenses the body-repair pass to rewrite a
    // page's content. An adopted page is human-authored — setting it here
    // would hand a stranger's Notion page to a rewriter.
    const data = db.ticketSync.update.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data.remoteCreatedAt).toBeUndefined();
    // Null snapshot: the first merge treats both sides as changed and resolves
    // by last-write-wins, exactly as the inbound adoption pass does.
    expect(data.snapshot).toBe(Prisma.DbNull);
  });

  it("refuses to create when the same-titled row belongs to another ticket", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    db.ticketSync.findMany.mockResolvedValue([
      { externalId: "page-9", ticket: { number: 122 } },
    ] as never);
    const adapter = fakeAdapter(null, {
      pagesByTitle: [{ externalId: "page-9", url: null }],
    });

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    // Two Exponential tickets for one Notion row. A third copy helps nobody.
    expect(item.action).toBe("skipped");
    // Matched without the leading hash — the pre-commit colour hook reads a
    // three-digit ticket reference as a hardcoded hex colour.
    expect(item.reason).toContain("122");
    expect(adapter.creates).toHaveLength(0);
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });

  it("refuses to guess when several rows share the title", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const adapter = fakeAdapter(null, {
      pagesByTitle: [
        { externalId: "page-9", url: null },
        { externalId: "page-10", url: null },
      ],
    });

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(item.reason).toContain("2 Notion rows share this title");
    expect(adapter.creates).toHaveLength(0);
  });

  it("dry run previews the adoption without linking", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ snapshot: null, externalId: "pending:t1" }) as never,
    );
    const adapter = fakeAdapter(null, {
      pagesByTitle: [{ externalId: "page-9", url: null }],
    });

    const item = await runOutboundTicketPush(db, adapter, {
      syncId: "s1",
      dryRun: true,
    });

    expect(item.action).toBe("adopted");
    expect(item.reason).toContain("would link");
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });
});

describe("runOutboundTicketPush — outbound archive", () => {
  it("trashes the Notion page and tombstones the link", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { status: "ARCHIVED" } }) as never,
    );
    const adapter = fakeAdapter(remoteRow());

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("archived");
    expect(adapter.archives).toEqual(["page-1"]);
    expect(adapter.updates).toHaveLength(0); // no property push
    expect(db.ticketSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tombstonedAt: expect.any(Date),
          snapshot: expect.objectContaining({ status: "ARCHIVED" }),
        }),
      }),
    );
  });

  it("dry run reports the would-be archive without trashing", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({ ticket: { status: "ARCHIVED" } }) as never,
    );
    const adapter = fakeAdapter(remoteRow());

    const item = await runOutboundTicketPush(db, adapter, {
      syncId: "s1",
      dryRun: true,
    });

    expect(item.action).toBe("archived");
    expect(adapter.archives).toHaveLength(0);
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });
});

describe("runOutboundTicketPush — unreadable cycle relation (frosty.flame)", () => {
  it("neutralizes the unknown remote cycle: no write, no local clear, cause surfaced", async () => {
    // Local ticket carries a cycle; the remote row reports the relation as
    // unreadable (cycleName null + cycleUnreadable). Without neutralization
    // the merge would read this as "remote cleared the cycle" and stage a
    // phantom applyToLocal that clears it locally.
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({
        snapshot: snapshotFor({ cycleName: "Sprint 1" }),
        ticket: { cycle: { name: "Sprint 1" } },
      }) as never,
    );
    const adapter = fakeAdapter(
      remoteRow({ cycleName: null, cycleUnreadable: true }),
    );

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("skipped");
    expect(item.reason).toContain("cycle page unreadable");
    expect(adapter.updates).toHaveLength(0);
    // Nothing was written in either direction, so the snapshot stays put.
    expect(db.ticketSync.update).not.toHaveBeenCalled();
  });

  it("still pushes unrelated scalar changes while the cycle is unreadable", async () => {
    db.ticketSync.findUnique.mockResolvedValue(
      syncRecord({
        snapshot: snapshotFor({ cycleName: "Sprint 1", title: "Old" }),
        ticket: { cycle: { name: "Sprint 1" }, title: "New title" },
      }) as never,
    );
    const adapter = fakeAdapter(
      remoteRow({ title: "Old", cycleName: null, cycleUnreadable: true }),
    );

    const item = await runOutboundTicketPush(db, adapter, { syncId: "s1" });

    expect(item.action).toBe("pushed");
    expect(item.wrote).toEqual(["title"]);
    expect(item.reason).toContain("cycle page unreadable");
    expect(adapter.updates).toHaveLength(1);
  });
});
