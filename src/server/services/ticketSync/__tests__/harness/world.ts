import type { PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import {
  runInboundTicketSync,
  type InboundSyncResult,
} from "../../engine";
import {
  runOutboundTicketPush,
  type OutboundPushItem,
} from "../../push";
import {
  FakeNotion,
  POINTS_TO_RAW,
  PRIORITY_TO_RAW,
  STATUS_TO_RAW,
  TYPE_TO_RAW,
  type FakePage,
  type NotionWrite,
} from "./fakeNotion";
import {
  FakeSyncDb,
  type DbWrite,
  type FakeConfig,
  type FakeSyncRecord,
  type FakeTicket,
} from "./fakeSyncDb";
import { TestClock } from "./testClock";

/**
 * The round-trip world: one FakeNotion + one FakeSyncDb sharing a TestClock,
 * with drivers for full sync cycles.
 *
 * NOTE for test files: the engine imports `createTicketWithNumber`,
 * the tag helpers, and `recordActivity` directly (not injectable), so any test
 * importing this harness must vi.mock those three modules exactly as
 * engine.test.ts does — see roundTrip.test.ts for the canonical block.
 */

export interface SeededLink {
  ticket: FakeTicket;
  page: FakePage;
  sync: FakeSyncRecord;
}

export interface RoundTripWorld {
  clock: TestClock;
  notion: FakeNotion;
  db: FakeSyncDb;
  prisma: PrismaClient;
  /** One inbound run (Notion → Exponential). */
  pull(opts?: { dryRun?: boolean }): Promise<InboundSyncResult>;
  /** Push every sync record once (Exponential → Notion). */
  pushAll(opts?: { dryRun?: boolean }): Promise<OutboundPushItem[]>;
  /** One full cycle: pull, then push everything. */
  cycle(): Promise<{ pull: InboundSyncResult; pushes: OutboundPushItem[] }>;
  /**
   * Seed a ticket + Notion page holding the SAME values, linked with a
   * converged snapshot — the steady state a healthy sync leaves behind.
   */
  seedSyncedTicket(overrides?: {
    title?: string;
    status?: TicketStatus;
    type?: TicketType;
    priority?: number | null;
    points?: number | null;
  }): SeededLink;
  /** Adapter writes + sync-driven ticket writes since the last clear. */
  notionWrites(): NotionWrite[];
  ticketWrites(): DbWrite[];
  clearWrites(): void;
}

export function createRoundTripWorld(opts?: {
  config?: Partial<FakeConfig>;
}): RoundTripWorld {
  const clock = new TestClock();
  const notion = new FakeNotion(clock);
  const db = new FakeSyncDb(clock, opts?.config);
  const prisma = db.asPrismaClient();

  const pull = (pullOpts?: { dryRun?: boolean }) =>
    runInboundTicketSync(prisma, notion, {
      configId: db.config.id,
      trigger: "manual",
      dryRun: pullOpts?.dryRun,
    });

  const pushAll = async (pushOpts?: { dryRun?: boolean }) => {
    const items: OutboundPushItem[] = [];
    for (const sync of [...db.syncs.values()]) {
      items.push(
        await runOutboundTicketPush(prisma, notion, {
          syncId: sync.id,
          dryRun: pushOpts?.dryRun,
        }),
      );
    }
    return items;
  };

  const seedSyncedTicket: RoundTripWorld["seedSyncedTicket"] = (
    overrides = {},
  ) => {
    const title = overrides.title ?? "Seeded row";
    const status = overrides.status ?? "IN_PROGRESS";
    const type = overrides.type ?? "BUG";
    const priority = overrides.priority !== undefined ? overrides.priority : 1;
    const points = overrides.points !== undefined ? overrides.points : 5;

    const rawStatus = STATUS_TO_RAW[status];
    const rawType = TYPE_TO_RAW[type];
    const rawPriority = priority === null ? null : PRIORITY_TO_RAW[priority];
    const rawEffort = points === null ? null : POINTS_TO_RAW[points];
    if (rawStatus === undefined || rawType === undefined) {
      throw new Error("seedSyncedTicket: unmapped status/type");
    }
    if (rawPriority === undefined || rawEffort === undefined) {
      throw new Error(
        "seedSyncedTicket: use priority 0-4 and points 1/3/5/8 (or null)",
      );
    }

    const ticket = db.seedTicket({ title, status, type, priority, points });
    const page = notion.seedPage({
      title,
      rawStatus,
      rawType,
      rawPriority,
      rawEffort,
    });
    const sync = db.linkTicket(ticket.id, page.externalId, {
      title,
      status,
      priority,
      type,
      points,
      labels: [],
      cycleName: null,
      assigneeEmail: null,
    });
    return { ticket, page, sync };
  };

  return {
    clock,
    notion,
    db,
    prisma,
    pull,
    pushAll,
    cycle: async () => {
      const pullResult = await pull();
      const pushes = await pushAll();
      return { pull: pullResult, pushes };
    },
    seedSyncedTicket,
    notionWrites: () => [...notion.writes],
    ticketWrites: () => db.ticketWrites(),
    clearWrites: () => {
      notion.writes.length = 0;
      db.clearWriteLog();
    },
  };
}
