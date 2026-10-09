/**
 * Unit tests for the product Overview AI summary. mockDeep<PrismaClient> and
 * an injected fake OpenAI client: no real DB, no real LLM call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const logInteraction = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/AiInteractionLogger", () => ({
  getAiInteractionLogger: () => ({ logInteraction }),
}));

import {
  buildFacts,
  constrainBold,
  getOrGenerateOverviewSummary,
  getRecentOverviewSummary,
  hashFacts,
  type SummaryOpenAIClient,
} from "../overviewSummaryService";
import type { ManagerOverview } from "../managerOverviewLoader";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const product = { id: "p1", name: "Plugin", workspaceId: "w1" };
const NOW = new Date("2026-10-04T12:00:00.000Z");
const HOUR = 3_600_000;

function overview(overrides: Partial<ManagerOverview> = {}): ManagerOverview {
  return {
    firstRun: false,
    windowDays: 14,
    cycle: null,
    weekly: [],
    summary: { shippedScopes: [{ feature: "Graph", scope: "Label filters" }], doneInWindow: 3, deployedInWindow: 2 },
    atRisk: [],
    criticalPath: [],
    criticalPathHasDeps: false,
    stages: [
      { key: "committed", count: 1, avgAgeMs: 0, agesMs: [] },
      { key: "inProgress", count: 2, avgAgeMs: 0, agesMs: [] },
      { key: "inReview", count: 1, avgAgeMs: 0, agesMs: [] },
      { key: "done", count: 3, avgAgeMs: 0, agesMs: [] },
      { key: "deployed", count: 2, avgAgeMs: 0, agesMs: [] },
    ],
    bottleneck: null,
    waitingOn: { people: 1, agents: 0, blocked: 0 },
    wip: { count: 3, activeHumans: 2 },
    team: [],
    prs: { hasData: false, open: 0, withoutReview: 0, medianWaitMs: null, medianMergeMs: null, rows: [] },
    ...overrides,
  } as ManagerOverview;
}

function fakeOpenAI(content: string): SummaryOpenAIClient & { calls: number } {
  const client = {
    calls: 0,
    chat: {
      completions: {
        create: vi.fn(async () => {
          client.calls += 1;
          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 100, completion_tokens: 40 },
          } as never;
        }),
      },
    },
  };
  return client;
}

function storedRow(inputHash: string, ageMs: number) {
  return {
    id: "s1",
    productId: product.id,
    summary: "Cached summary.",
    risk: null,
    inputHash,
    model: "gpt-4o-mini",
    tokensIn: 1,
    tokensOut: 1,
    generatedAt: new Date(NOW.getTime() - ageMs),
  };
}

beforeEach(() => {
  mockReset(db);
  logInteraction.mockReset().mockResolvedValue(undefined);
  db.productOverviewSummary.upsert.mockImplementation(
    (async (args: { create: { summary: string; risk: string | null } }) => ({
      ...storedRow("x", 0),
      summary: args.create.summary,
      risk: args.create.risk,
      generatedAt: NOW,
    })) as never,
  );
});

describe("getOrGenerateOverviewSummary", () => {
  it("reuses the stored summary when the facts are unchanged", async () => {
    const data = overview();
    const hash = hashFacts(buildFacts(product, data));
    db.productOverviewSummary.findUnique.mockResolvedValue(storedRow(hash, 5 * HOUR));
    const openai = fakeOpenAI("{}");
    const r = await getOrGenerateOverviewSummary(db, { product, data, userId: "u1", now: NOW, openai });
    expect(r).toMatchObject({ summary: "Cached summary.", cached: true });
    expect(openai.calls).toBe(0);
  });

  it("does not regenerate more than once an hour even when facts change", async () => {
    db.productOverviewSummary.findUnique.mockResolvedValue(storedRow("old-hash", 20 * 60_000));
    const openai = fakeOpenAI("{}");
    const r = await getOrGenerateOverviewSummary(db, { product, data: overview(), userId: "u1", now: NOW, openai });
    expect(r.cached).toBe(true);
    expect(openai.calls).toBe(0);
  });

  it("regenerates when facts changed and the row is over an hour old, un-bolding unknown names", async () => {
    db.productOverviewSummary.findUnique.mockResolvedValue(storedRow("old-hash", 2 * HOUR));
    const openai = fakeOpenAI(
      JSON.stringify({
        summary: "**Graph · Label filters** shipped and **Project Zeus** is next.",
        risk: null,
      }),
    );
    const r = await getOrGenerateOverviewSummary(db, { product, data: overview(), userId: "u1", now: NOW, openai });
    expect(openai.calls).toBe(1);
    expect(r.cached).toBe(false);
    expect(r.summary).toBe("**Graph · Label filters** shipped and Project Zeus is next.");
  });

  it("writes a canned line without calling the model when nothing is happening", async () => {
    db.productOverviewSummary.findUnique.mockResolvedValue(null);
    const quiet = overview({
      summary: { shippedScopes: [], doneInWindow: 0, deployedInWindow: 0 },
      stages: overview().stages.map((s) => ({ ...s, count: 0 })),
    });
    const openai = fakeOpenAI("{}");
    const r = await getOrGenerateOverviewSummary(db, { product, data: quiet, userId: "u1", now: NOW, openai });
    expect(openai.calls).toBe(0);
    expect(r.summary).toMatch(/Nothing was completed/);
  });

  it("still calls the model when the only news is a shipped scope", async () => {
    db.productOverviewSummary.findUnique.mockResolvedValue(null);
    const shippedOnly = overview({
      summary: { shippedScopes: [{ feature: "Graph", scope: "Label filters" }], doneInWindow: 0, deployedInWindow: 0 },
      stages: overview().stages.map((s) => ({ ...s, count: 0 })),
    });
    const openai = fakeOpenAI(JSON.stringify({ summary: "**Graph · Label filters** shipped.", risk: null }));
    const r = await getOrGenerateOverviewSummary(db, { product, data: shippedOnly, userId: "u1", now: NOW, openai });
    expect(openai.calls).toBe(1);
    expect(r.summary).toMatch(/Label filters/);
  });

  it("logs and propagates an invalid model response", async () => {
    db.productOverviewSummary.findUnique.mockResolvedValue(null);
    const openai = fakeOpenAI("not json");
    await expect(
      getOrGenerateOverviewSummary(db, { product, data: overview(), userId: "u1", now: NOW, openai }),
    ).rejects.toThrow();
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ hadError: true, aiResponse: "not json" }),
    );
  });

  // The failure cooldown is per product and per server instance, so each of
  // these uses its own product id.
  it("does not call the model again during the cooldown after a failure", async () => {
    const p = { ...product, id: "p-cooldown" };
    db.productOverviewSummary.findUnique.mockResolvedValue(null);
    const openai = fakeOpenAI("not json");
    const call = (now: Date) =>
      getOrGenerateOverviewSummary(db, { product: p, data: overview(), userId: "u1", now, openai });
    await expect(call(NOW)).rejects.toThrow();
    await expect(call(new Date(NOW.getTime() + 60_000))).rejects.toThrow(/recently failed/);
    expect(openai.calls).toBe(1);
    // After the cooldown it tries again.
    await expect(call(new Date(NOW.getTime() + HOUR))).rejects.toThrow();
    expect(openai.calls).toBe(2);
  });

  it("serves the stored summary when regeneration fails", async () => {
    const p = { ...product, id: "p-fallback" };
    db.productOverviewSummary.findUnique.mockResolvedValue({
      ...storedRow("old-hash", 2 * HOUR),
      productId: p.id,
    });
    const openai = fakeOpenAI("not json");
    const r = await getOrGenerateOverviewSummary(db, { product: p, data: overview(), userId: "u1", now: NOW, openai });
    expect(openai.calls).toBe(1);
    expect(r).toMatchObject({ summary: "Cached summary.", cached: true });
  });
});

describe("getRecentOverviewSummary", () => {
  it("returns the stored summary only while it is under an hour old", async () => {
    db.productOverviewSummary.findUnique.mockResolvedValue(storedRow("h", 20 * 60_000));
    await expect(getRecentOverviewSummary(db, product.id, NOW)).resolves.toMatchObject({
      summary: "Cached summary.",
      cached: true,
    });
    db.productOverviewSummary.findUnique.mockResolvedValue(storedRow("h", 2 * HOUR));
    await expect(getRecentOverviewSummary(db, product.id, NOW)).resolves.toBeNull();
    db.productOverviewSummary.findUnique.mockResolvedValue(null);
    await expect(getRecentOverviewSummary(db, product.id, NOW)).resolves.toBeNull();
  });
});

describe("constrainBold", () => {
  it("keeps bold only for known names", () => {
    expect(constrainBold("**Mia** and **Bob** and **an**", ["mia kovač"])).toBe("**Mia** and Bob and an");
  });
});
