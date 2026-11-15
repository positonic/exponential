/**
 * The usage ledger, seen as a workspace would experience it: what its month's
 * counter reads after Assistant turns, on its own key or the hosted one, on an
 * install that meters and on one that does not.
 *
 * Runs against a small in-memory ledger, so the assertions are about what was
 * stored, not about which Prisma calls were made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/utils/reportHandledErrorServer", () => ({
  reportHandledErrorServer: vi.fn(),
}));

import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import {
  getPeriodUsage,
  recordTurnUsage,
  recordUsage,
  resolveMeteredWorkspaceId,
  usagePeriodEnd,
  usagePeriodStart,
  type UsageDb,
} from "../usage";

const METER = { BILLING_MODE: "meter" };
const OFF = {};
const WORKSPACE = "ws-1";
const NOVEMBER = new Date("2026-11-15T10:00:00Z");
const DECEMBER = new Date("2026-12-02T10:00:00Z");

interface StoredEvent {
  workspaceId: string;
  source: string;
  modelId: string | null;
  costMicros: number;
  onOwnKey: boolean;
  refId: string | null;
}

type Operation = () => void;

/** An in-memory stand-in for the two ledger tables, with all-or-nothing transactions. */
function createLedger(options: { failPeriodWrite?: boolean } = {}) {
  let events: StoredEvent[] = [];
  let periods = new Map<string, number>();
  const key = (workspaceId: string, periodStart: Date) => `${workspaceId}|${periodStart.toISOString()}`;

  const db = {
    usageEvent: {
      create:
        ({ data }: { data: StoredEvent }): Operation =>
        () => {
          events.push(data);
        },
    },
    workspaceUsagePeriod: {
      upsert:
        ({
          where,
          create,
          update,
        }: {
          where: { workspaceId_periodStart: { workspaceId: string; periodStart: Date } };
          create: { costMicros: number };
          update: { costMicros: { increment: number } };
        }): Operation =>
        () => {
          if (options.failPeriodWrite) throw new Error("connection lost");
          const id = key(where.workspaceId_periodStart.workspaceId, where.workspaceId_periodStart.periodStart);
          const current = periods.get(id);
          periods.set(id, current === undefined ? create.costMicros : current + update.costMicros.increment);
        },
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_periodStart: { workspaceId: string; periodStart: Date } };
      }) => {
        const costMicros = periods.get(
          key(where.workspaceId_periodStart.workspaceId, where.workspaceId_periodStart.periodStart),
        );
        return costMicros === undefined ? null : { costMicros };
      },
    },
    $transaction: async (operations: Operation[]) => {
      const before = { events: [...events], periods: new Map(periods) };
      try {
        operations.forEach((run) => run());
      } catch (error) {
        events = before.events;
        periods = before.periods;
        throw error;
      }
    },
  };

  return {
    db: db as unknown as UsageDb,
    events: () => events,
    used: async (now: Date) => (await getPeriodUsage(db as unknown as UsageDb, WORKSPACE, now)).usedMicros,
  };
}

/** A one-step Sonnet 4.5 turn: 1,000 fresh input tokens, 200 output. $0.003 + $0.003. */
const SONNET_TURN = {
  modelId: "claude-sonnet-4-5-20250929",
  turnUsage: { inputTokens: 1_000, outputTokens: 200, cachedInputTokens: 0 },
  costMicros: 6_000,
};

beforeEach(() => {
  vi.mocked(reportHandledErrorServer).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("usage periods", () => {
  it("run from the first instant of a calendar month to the first of the next, in UTC", () => {
    expect(usagePeriodStart(NOVEMBER).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(usagePeriodEnd(NOVEMBER).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("put the last millisecond of the year in December and the next in January", () => {
    expect(usagePeriodStart(new Date("2026-12-31T23:59:59.999Z")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(usagePeriodEnd(new Date("2026-12-31T23:59:59.999Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(usagePeriodStart(new Date("2027-01-01T00:00:00.000Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("on an install that does not meter", () => {
  it("records nothing", async () => {
    const ledger = createLedger();

    const recorded = await recordUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", costMicros: 5_000 },
      { env: OFF, now: NOVEMBER },
    );
    const cost = await recordTurnUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", ...SONNET_TURN },
      { env: OFF, now: NOVEMBER },
    );

    expect(recorded).toBe(false);
    expect(cost).toBeUndefined();
    expect(ledger.events()).toEqual([]);
    expect(await ledger.used(NOVEMBER)).toBe(0);
  });
});

describe("on an install that meters", () => {
  it("records one event for a turn and adds its cost to the month", async () => {
    const ledger = createLedger();

    await recordUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", modelId: "claude-haiku-4-5", costMicros: 5_000, refId: "interaction-1" },
      { env: METER, now: NOVEMBER },
    );

    expect(ledger.events()).toEqual([
      {
        workspaceId: WORKSPACE,
        source: "CHAT",
        modelId: "claude-haiku-4-5",
        costMicros: 5_000,
        onOwnKey: false,
        refId: "interaction-1",
      },
    ]);
    expect(await ledger.used(NOVEMBER)).toBe(5_000);
  });

  it("adds turns up within a month and starts from zero the next month", async () => {
    const ledger = createLedger();
    const turn = { workspaceId: WORKSPACE, source: "AGENT_RUN" as const, costMicros: 40_000 };

    await recordUsage(ledger.db, turn, { env: METER, now: NOVEMBER });
    await recordUsage(ledger.db, turn, { env: METER, now: new Date("2026-11-30T23:59:59Z") });
    expect(await ledger.used(NOVEMBER)).toBe(80_000);
    expect(await ledger.used(DECEMBER)).toBe(0);

    await recordUsage(ledger.db, turn, { env: METER, now: DECEMBER });
    expect(await ledger.used(DECEMBER)).toBe(40_000);
    expect(await ledger.used(NOVEMBER)).toBe(80_000);
  });

  it("records a turn on the workspace's own key without counting it", async () => {
    const ledger = createLedger();

    await recordUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", costMicros: 90_000, onOwnKey: true },
      { env: METER, now: NOVEMBER },
    );

    expect(ledger.events()).toHaveLength(1);
    expect(ledger.events()[0]).toMatchObject({ onOwnKey: true, costMicros: 90_000 });
    expect(await ledger.used(NOVEMBER)).toBe(0);
  });

  it("counts the same in enforce mode", async () => {
    const ledger = createLedger();

    await recordUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "VOICE", costMicros: 1_200 },
      { env: { BILLING_MODE: "enforce" }, now: NOVEMBER },
    );

    expect(await ledger.used(NOVEMBER)).toBe(1_200);
  });

  it("never throws when the database fails, and leaves no half-written turn", async () => {
    const ledger = createLedger({ failPeriodWrite: true });

    const recorded = await recordUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", costMicros: 5_000 },
      { env: METER, now: NOVEMBER },
    );

    expect(recorded).toBe(false);
    expect(ledger.events()).toEqual([]);
  });

  it("drops a record whose cost is not a real amount", async () => {
    const ledger = createLedger();

    await recordUsage(ledger.db, { workspaceId: WORKSPACE, source: "CHAT", costMicros: Number.NaN }, { env: METER });
    await recordUsage(ledger.db, { workspaceId: WORKSPACE, source: "CHAT", costMicros: -1 }, { env: METER });

    expect(ledger.events()).toEqual([]);
  });
});

describe("recordTurnUsage", () => {
  it("prices the turn from the usage Mastra reported and records that cost", async () => {
    const ledger = createLedger();

    const cost = await recordTurnUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", ...SONNET_TURN, refId: "interaction-9" },
      { env: METER, now: NOVEMBER },
    );

    expect(cost).toBe(SONNET_TURN.costMicros);
    expect(ledger.events()).toEqual([
      {
        workspaceId: WORKSPACE,
        source: "CHAT",
        modelId: SONNET_TURN.modelId,
        costMicros: SONNET_TURN.costMicros,
        onOwnKey: false,
        refId: "interaction-9",
      },
    ]);
    expect(await ledger.used(NOVEMBER)).toBe(SONNET_TURN.costMicros);
  });

  it("prices cache reads from the per-step usage, once", async () => {
    const ledger = createLedger();
    const step = {
      inputTokens: 60_400,
      outputTokens: 500,
      cachedInputTokens: 60_000,
      raw: {
        inputTokens: { total: 60_400, noCache: 400, cacheRead: 60_000, cacheWrite: 0 },
        outputTokens: { total: 500 },
      },
    };

    const cost = await recordTurnUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", modelId: SONNET_TURN.modelId, turnUsage: step, stepUsages: [step] },
      { env: METER, now: NOVEMBER },
    );

    // $0.0012 fresh input + $0.018 cache read + $0.0075 output.
    expect(cost).toBe(26_700);
  });

  it("writes nothing for a turn that reported no usage", async () => {
    const ledger = createLedger();

    const cost = await recordTurnUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "CHAT", modelId: SONNET_TURN.modelId, turnUsage: undefined },
      { env: METER, now: NOVEMBER },
    );

    expect(cost).toBeUndefined();
    expect(ledger.events()).toEqual([]);
    expect(reportHandledErrorServer).not.toHaveBeenCalled();
  });

  it("files a bug instead of guessing when the model has no price", async () => {
    const ledger = createLedger();

    const cost = await recordTurnUsage(
      ledger.db,
      { workspaceId: WORKSPACE, source: "AGENT_RUN", modelId: "some-new-model", turnUsage: SONNET_TURN.turnUsage },
      { env: METER, now: NOVEMBER },
    );

    expect(cost).toBeUndefined();
    expect(ledger.events()).toEqual([]);
    await vi.waitFor(() => expect(reportHandledErrorServer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reportHandledErrorServer).mock.calls[0]?.[1]).toMatchObject({
      area: "billing-metering",
      context: { modelId: "some-new-model", source: "AGENT_RUN" },
    });
  });
});

describe("which workspace a turn is metered to", () => {
  /** A database holding (or not) the person's Personal workspace. */
  function withPersonalWorkspace(id: string | null) {
    const findFirst = vi.fn(async () => (id ? { id } : null));
    return { db: { workspace: { findFirst } } as never, findFirst };
  }

  it("is the workspace the turn ran in", async () => {
    const { db, findFirst } = withPersonalWorkspace("personal-1");

    const workspaceId = await resolveMeteredWorkspaceId(db, { workspaceId: "ws-team", userId: "user-1" }, { env: METER });

    expect(workspaceId).toBe("ws-team");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("is the person's Personal workspace when the turn has none", async () => {
    const { db, findFirst } = withPersonalWorkspace("personal-1");

    const workspaceId = await resolveMeteredWorkspaceId(db, { workspaceId: null, userId: "user-1" }, { env: METER });

    expect(workspaceId).toBe("personal-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: "personal", ownerId: "user-1" } }),
    );
  });

  it("is nowhere for a person with no Personal workspace yet", async () => {
    const { db } = withPersonalWorkspace(null);

    expect(await resolveMeteredWorkspaceId(db, { userId: "user-1" }, { env: METER })).toBeNull();
  });

  it("is nowhere, without a lookup, on an install that does not meter", async () => {
    const { db, findFirst } = withPersonalWorkspace("personal-1");

    expect(await resolveMeteredWorkspaceId(db, { workspaceId: "ws-team", userId: "user-1" }, { env: OFF })).toBeNull();
    expect(await resolveMeteredWorkspaceId(db, { userId: "user-1" }, { env: OFF })).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("is nowhere, rather than an error, when the lookup fails", async () => {
    const db = { workspace: { findFirst: vi.fn().mockRejectedValue(new Error("connection lost")) } } as never;

    expect(await resolveMeteredWorkspaceId(db, { userId: "user-1" }, { env: METER })).toBeNull();
  });
});
