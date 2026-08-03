/**
 * V2 delivery signal (ADR-0050): done/total ticket counts on the linked
 * features carried by okr.getById / okr.getByObjective.
 *
 * External behavior under test:
 * - "Done" is the Delivery metrics page's completion definition (ADR-0047):
 *   DONE or DEPLOYED — ARCHIVED counts toward total but never toward done.
 * - Ticketless features carry ticketProgress: null (the chip is absent, never
 *   "0/0").
 * - No linked features → no ticket query at all.
 * - Strictly display-only: the delivery signal never writes the key result
 *   (currentValue stays check-in-only).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
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

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";
const KR_ID = "kr-1";

function featureLink(featureId: string) {
  return {
    id: `link-${featureId}`,
    keyResultId: KR_ID,
    featureId,
    feature: {
      id: featureId,
      name: `Feature ${featureId}`,
      status: "IN_DEVELOPMENT",
      product: { id: "prod-1", name: "P", slug: "p", icon: null, color: null },
    },
  };
}

function groupRow(featureId: string, status: string, count: number) {
  return { featureId, status, _count: { _all: count } };
}

type FeatureWithProgress = {
  feature: { id: string; ticketProgress: { done: number; total: number } | null };
};

describe("okr.getById — delivery signal (ticketProgress)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.keyResult.findFirst.mockResolvedValue({
      id: KR_ID,
      userId: USER_ID,
      goalId: 42,
      projects: [],
      features: [featureLink("feat-tickets"), featureLink("feat-none")],
    } as never);
  });

  it("attaches done/total per the ADR-0047 definition; ticketless features get null", async () => {
    // Tracer scenario: 5 tickets, 2 of them DONE/DEPLOYED -> "2/5".
    db.ticket.groupBy.mockResolvedValue([
      groupRow("feat-tickets", "IN_PROGRESS", 3),
      groupRow("feat-tickets", "DONE", 1),
      groupRow("feat-tickets", "DEPLOYED", 1),
    ] as never);
    const caller = createMockCaller({ userId: USER_ID, db });

    const result = (await caller.okr.getById({ id: KR_ID })) as unknown as {
      features: FeatureWithProgress[];
    };

    expect(result.features[0]!.feature.ticketProgress).toEqual({
      done: 2,
      total: 5,
    });
    // Absent chip contract: null, never { done: 0, total: 0 }.
    expect(result.features[1]!.feature.ticketProgress).toBeNull();
  });

  it("counts ARCHIVED toward total but never toward done (narrower than COMPLETED_TICKET_STATUSES)", async () => {
    db.ticket.groupBy.mockResolvedValue([
      groupRow("feat-tickets", "ARCHIVED", 2),
      groupRow("feat-tickets", "DONE", 1),
    ] as never);
    const caller = createMockCaller({ userId: USER_ID, db });

    const result = (await caller.okr.getById({ id: KR_ID })) as unknown as {
      features: FeatureWithProgress[];
    };

    expect(result.features[0]!.feature.ticketProgress).toEqual({
      done: 1,
      total: 3,
    });
  });

  it("skips the ticket query entirely when no features are linked", async () => {
    db.keyResult.findFirst.mockResolvedValue({
      id: KR_ID,
      userId: USER_ID,
      goalId: 42,
      projects: [],
      features: [],
    } as never);
    const caller = createMockCaller({ userId: USER_ID, db });

    await caller.okr.getById({ id: KR_ID });

    expect(db.ticket.groupBy).not.toHaveBeenCalled();
  });

  it("never writes the key result — the signal is display-only", async () => {
    db.ticket.groupBy.mockResolvedValue([
      groupRow("feat-tickets", "DONE", 5),
    ] as never);
    const caller = createMockCaller({ userId: USER_ID, db });

    await caller.okr.getById({ id: KR_ID });

    expect(db.keyResult.update).not.toHaveBeenCalled();
    expect(db.keyResult.updateMany).not.toHaveBeenCalled();
    expect(db.keyResultCheckIn.create).not.toHaveBeenCalled();
  });
});

describe("okr.getByObjective — delivery signal (ticketProgress)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);
    db.goal.findMany.mockResolvedValue([
      {
        id: 42,
        progressOverride: null,
        keyResults: [
          {
            id: KR_ID,
            status: "on-track",
            currentValue: 1,
            targetValue: 10,
            startValue: 0,
            checkIns: [],
            projects: [],
            features: [featureLink("feat-tickets"), featureLink("feat-none")],
          },
        ],
      },
    ] as never);
  });

  it("attaches done/total to nested linked features; ticketless features get null", async () => {
    db.ticket.groupBy.mockResolvedValue([
      groupRow("feat-tickets", "QA", 1),
      groupRow("feat-tickets", "DEPLOYED", 2),
    ] as never);
    const caller = createMockCaller({ userId: USER_ID, db });

    const result = (await caller.okr.getByObjective({
      workspaceId: WORKSPACE_ID,
    })) as unknown as Array<{ keyResults: Array<{ features: FeatureWithProgress[] }> }>;

    const features = result[0]!.keyResults[0]!.features;
    expect(features[0]!.feature.ticketProgress).toEqual({ done: 2, total: 3 });
    expect(features[1]!.feature.ticketProgress).toBeNull();

    // One deduped query for the whole response.
    expect(db.ticket.groupBy).toHaveBeenCalledTimes(1);
    const arg = db.ticket.groupBy.mock.calls[0]![0] as unknown as {
      where: { featureId: { in: string[] } };
    };
    expect([...arg.where.featureId.in].sort()).toEqual([
      "feat-none",
      "feat-tickets",
    ]);
  });

  it("never writes the key result — the signal is display-only", async () => {
    db.ticket.groupBy.mockResolvedValue([] as never);
    const caller = createMockCaller({ userId: USER_ID, db });

    await caller.okr.getByObjective({ workspaceId: WORKSPACE_ID });

    expect(db.keyResult.update).not.toHaveBeenCalled();
    expect(db.keyResult.updateMany).not.toHaveBeenCalled();
    expect(db.keyResultCheckIn.create).not.toHaveBeenCalled();
  });
});
