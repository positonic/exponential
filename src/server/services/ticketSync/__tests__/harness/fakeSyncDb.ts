import { Prisma } from "@prisma/client";
import type { PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import type { SyncedFields } from "../../merge";
import type { TestClock } from "./testClock";

/**
 * FakeSyncDb — a STATEFUL in-memory stand-in for the slice of Prisma the two
 * sync runners touch (ticket, ticketSync, ticketSyncConfig, ticketSyncRun).
 *
 * The per-direction unit suites use `mockDeep<PrismaClient>` with canned
 * returns; that can't express a round trip, where a pull's snapshot advance
 * must be visible to the next push. This fake actually persists: writes mutate
 * the stores, reads reflect them, and every mutation is appended to
 * {@link FakeSyncDb.writeLog} so tests can assert zero-write quiescence.
 *
 * It implements ONLY the call shapes the runners make and throws loudly on
 * anything else — an unsupported shape means the engine changed and the fake
 * (not the assertion) needs extending.
 */

export interface FakeTicket {
  id: string;
  number: number;
  title: string;
  body: string | null;
  status: TicketStatus;
  type: TicketType;
  priority: number | null;
  points: number | null;
  labels: string[];
  cycleName: string | null;
  assigneeEmail: string | null;
  links: Record<string, unknown> | null;
  updatedAt: Date;
}

export interface FakeSyncRecord {
  id: string;
  configId: string;
  ticketId: string;
  provider: string;
  externalId: string;
  externalUrl: string | null;
  snapshot: Record<string, unknown> | null;
  lastSyncedAt: Date | null;
  tombstonedAt: Date | null;
}

export interface FakeConfig {
  id: string;
  productId: string;
  provider: string;
  integrationId: string | null;
  databaseId: string;
  enabled: boolean;
  pushEnabled: boolean;
  statusMap: Record<string, TicketStatus> | null;
  propertyNames: Record<string, string> | null;
  lastPulledAt: Date | null;
  createdById: string;
  product: {
    id: string;
    workspaceId: string;
    slug: string;
    workspace: { slug: string };
  };
}

export interface DbWrite {
  model: "ticket" | "ticketSync" | "ticketSyncConfig" | "ticketSyncRun";
  op: "create" | "update" | "delete";
  id: string | null;
  data: unknown;
}

interface WhereById {
  where: { id: string };
}

export class FakeSyncDb {
  readonly tickets = new Map<string, FakeTicket>();
  readonly syncs = new Map<string, FakeSyncRecord>();
  readonly runs = new Map<string, Record<string, unknown>>();
  readonly writeLog: DbWrite[] = [];
  readonly config: FakeConfig;

  private ticketCounter = 0;
  private syncCounter = 0;
  private runCounter = 0;

  constructor(
    private readonly clock: TestClock,
    configOverrides: Partial<FakeConfig> = {},
  ) {
    this.config = {
      id: "cfg1",
      productId: "prod1",
      provider: "notion",
      integrationId: "int1",
      databaseId: "db1",
      enabled: true,
      pushEnabled: true,
      statusMap: null,
      propertyNames: null,
      lastPulledAt: null,
      createdById: "user1",
      product: {
        id: "prod1",
        workspaceId: "ws1",
        slug: "prod",
        workspace: { slug: "ws" },
      },
      ...configOverrides,
    };
  }

  // ── seeding & simulated local (user) activity ─────────────────────────────

  seedTicket(overrides: Partial<FakeTicket> = {}): FakeTicket {
    const n = ++this.ticketCounter;
    const ticket: FakeTicket = {
      id: `t${n}`,
      number: n,
      title: "Seeded row",
      body: null,
      status: "IN_PROGRESS",
      type: "BUG",
      priority: 1,
      points: 5,
      labels: [],
      cycleName: null,
      assigneeEmail: null,
      links: null,
      updatedAt: this.clock.now(),
      ...overrides,
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  linkTicket(
    ticketId: string,
    externalId: string,
    snapshot: Partial<SyncedFields> | null,
  ): FakeSyncRecord {
    const record: FakeSyncRecord = {
      id: `sync${++this.syncCounter}`,
      configId: this.config.id,
      ticketId,
      provider: this.config.provider,
      externalId,
      externalUrl: null,
      snapshot: (snapshot as Record<string, unknown> | null) ?? null,
      lastSyncedAt: snapshot ? this.clock.now() : null,
      tombstonedAt: null,
    };
    this.syncs.set(record.id, record);
    return record;
  }

  /** Simulate a user editing the ticket in Exponential (not a sync write). */
  editTicketLocally(
    ticketId: string,
    patch: Partial<
      Pick<
        FakeTicket,
        | "title"
        | "status"
        | "type"
        | "priority"
        | "points"
        | "labels"
        | "cycleName"
        | "assigneeEmail"
      >
    >,
  ): FakeTicket {
    const ticket = this.mustGetTicket(ticketId);
    Object.assign(ticket, patch);
    ticket.updatedAt = this.clock.advance();
    return ticket;
  }

  /** Sync-driven ticket field writes (the "local side writes" of a run). */
  ticketWrites(): DbWrite[] {
    return this.writeLog.filter((w) => w.model === "ticket" && w.op === "update");
  }

  clearWriteLog(): void {
    this.writeLog.length = 0;
  }

  // ── the PrismaClient facade ───────────────────────────────────────────────

  asPrismaClient(): PrismaClient {
    const facade = {
      ticketSyncConfig: {
        findUniqueOrThrow: (args: WhereById) => {
          if (args.where.id !== this.config.id) {
            return Promise.reject(
              new Error(`FakeSyncDb: unknown config ${args.where.id}`),
            );
          }
          return Promise.resolve({ ...this.config });
        },
        update: (args: WhereById & { data: { lastPulledAt?: Date } }) => {
          if (args.data.lastPulledAt !== undefined) {
            this.config.lastPulledAt = args.data.lastPulledAt;
          }
          this.writeLog.push({
            model: "ticketSyncConfig",
            op: "update",
            id: args.where.id,
            data: args.data,
          });
          return Promise.resolve({ ...this.config });
        },
      },

      ticketSyncRun: {
        create: (args: { data: Record<string, unknown> }) => {
          const id = `run${++this.runCounter}`;
          this.runs.set(id, { id, ...args.data });
          return Promise.resolve({ id });
        },
        update: (args: WhereById & { data: Record<string, unknown> }) => {
          const run = this.runs.get(args.where.id);
          if (!run) {
            return Promise.reject(
              new Error(`FakeSyncDb: unknown run ${args.where.id}`),
            );
          }
          Object.assign(run, args.data);
          return Promise.resolve({ ...run });
        },
      },

      ticket: {
        findMany: (args: { where?: Record<string, unknown> }) => {
          // The only findMany the engine issues is the adoption scan
          // (links set, no sync record for this config).
          if (!args.where || !("links" in args.where)) {
            return Promise.reject(
              new Error("FakeSyncDb: unsupported ticket.findMany shape"),
            );
          }
          const linkedTicketIds = new Set(
            [...this.syncs.values()]
              .filter((s) => s.configId === this.config.id)
              .map((s) => s.ticketId),
          );
          const adoptable = [...this.tickets.values()]
            .filter((t) => t.links !== null && !linkedTicketIds.has(t.id))
            .map((t) => ({ id: t.id, title: t.title, links: t.links }));
          return Promise.resolve(adoptable);
        },
        findUnique: (args: WhereById) => {
          const t = this.tickets.get(args.where.id);
          return Promise.resolve(t ? this.ticketView(t) : null);
        },
        update: (args: WhereById & { data: Record<string, unknown> }) => {
          const t = this.mustGetTicket(args.where.id);
          for (const key of [
            "title",
            "status",
            "type",
            "priority",
            "points",
          ] as const) {
            if (key in args.data) {
              (t as Record<string, unknown>)[key] = args.data[key];
            }
          }
          if ("cycleId" in args.data || "assigneeId" in args.data) {
            throw new Error(
              "FakeSyncDb: relational id writes not supported yet — extend the fake",
            );
          }
          t.updatedAt = this.clock.now();
          this.writeLog.push({
            model: "ticket",
            op: "update",
            id: t.id,
            data: args.data,
          });
          return Promise.resolve(this.ticketView(t));
        },
      },

      ticketSync: {
        findMany: (_args: unknown) => {
          const records = [...this.syncs.values()]
            .filter((s) => s.configId === this.config.id)
            .map((s) => ({ ...s }));
          return Promise.resolve(records);
        },
        findUnique: (args: WhereById) => {
          const s = this.syncs.get(args.where.id);
          if (!s) return Promise.resolve(null);
          const ticket = this.tickets.get(s.ticketId);
          return Promise.resolve({
            ...s,
            config: { ...this.config },
            ticket: ticket ? this.ticketView(ticket) : null,
          });
        },
        create: (args: { data: Record<string, unknown> }) => {
          const data = args.data;
          const externalId = data.externalId as string;
          const collision = [...this.syncs.values()].some(
            (s) =>
              (s.configId === data.configId && s.externalId === externalId) ||
              (s.ticketId === data.ticketId && s.provider === data.provider),
          );
          if (collision) {
            return Promise.reject(
              new Error("FakeSyncDb: unique constraint violation on ticketSync"),
            );
          }
          const record: FakeSyncRecord = {
            id: `sync${++this.syncCounter}`,
            configId: data.configId as string,
            ticketId: data.ticketId as string,
            provider: data.provider as string,
            externalId,
            externalUrl: (data.externalUrl as string | null) ?? null,
            snapshot: this.normalizeSnapshot(data.snapshot),
            lastSyncedAt: (data.lastSyncedAt as Date | undefined) ?? null,
            tombstonedAt: null,
          };
          this.syncs.set(record.id, record);
          this.writeLog.push({
            model: "ticketSync",
            op: "create",
            id: record.id,
            data,
          });
          return Promise.resolve({ ...record });
        },
        update: (args: WhereById & { data: Record<string, unknown> }) => {
          const s = this.syncs.get(args.where.id);
          if (!s) {
            return Promise.reject(
              new Error(`FakeSyncDb: unknown sync ${args.where.id}`),
            );
          }
          const data = args.data;
          if ("snapshot" in data) s.snapshot = this.normalizeSnapshot(data.snapshot);
          if ("externalId" in data) s.externalId = data.externalId as string;
          if ("externalUrl" in data && data.externalUrl !== undefined) {
            s.externalUrl = data.externalUrl as string | null;
          }
          if ("lastSyncedAt" in data) s.lastSyncedAt = data.lastSyncedAt as Date;
          if ("tombstonedAt" in data) {
            s.tombstonedAt = data.tombstonedAt as Date | null;
          }
          this.writeLog.push({
            model: "ticketSync",
            op: "update",
            id: s.id,
            data,
          });
          return Promise.resolve({ ...s });
        },
        delete: (args: WhereById) => {
          const existed = this.syncs.delete(args.where.id);
          if (!existed) {
            return Promise.reject(
              new Error(`FakeSyncDb: unknown sync ${args.where.id}`),
            );
          }
          this.writeLog.push({
            model: "ticketSync",
            op: "delete",
            id: args.where.id,
            data: null,
          });
          return Promise.resolve({});
        },
      },

      // The runners only use the promise-array form; the fake's model methods
      // execute eagerly, so awaiting the batch is all a "transaction" needs.
      $transaction: (promises: Array<Promise<unknown>>) => Promise.all(promises),
    };

    return facade as unknown as PrismaClient;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private mustGetTicket(id: string): FakeTicket {
    const t = this.tickets.get(id);
    if (!t) throw new Error(`FakeSyncDb: no ticket ${id}`);
    return t;
  }

  /** The read shape both runners select (relations + tags as objects). */
  private ticketView(t: FakeTicket) {
    return {
      id: t.id,
      number: t.number,
      title: t.title,
      body: t.body,
      status: t.status,
      type: t.type,
      priority: t.priority,
      points: t.points,
      updatedAt: t.updatedAt,
      links: t.links,
      cycle: t.cycleName ? { name: t.cycleName } : null,
      assignee: t.assigneeEmail ? { email: t.assigneeEmail } : null,
      tags: t.labels.map((name) => ({ tag: { name } })),
    };
  }

  private normalizeSnapshot(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) return null;
    // Prisma.DbNull sentinel → stored NULL.
    if (value === Prisma.DbNull) return null;
    if (typeof value === "object" && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) };
    }
    return null;
  }
}
