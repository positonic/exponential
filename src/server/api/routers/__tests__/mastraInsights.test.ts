/**
 * The meeting-insights mutation passes no OpenAI client on an install without
 * OPENAI_API_KEY (smoky.anvil). The extractor must then fall back to keyword
 * matching rather than dereference the missing client and 500.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { extractInsightsFromTranscriptions } from "../mastra";

const TRANSCRIPT = {
  title: "Weekly sync",
  createdAt: new Date("2026-11-10T10:00:00Z"),
  transcription:
    "We agreed to ship the self-host installer next week. " +
    "There is a blocking problem with the Railway template that needs an owner. " +
    "Sam will do the README pass before Friday.",
};

describe("extractInsightsFromTranscriptions with no OpenAI client", () => {
  it("falls back to keyword extraction instead of throwing", async () => {
    const insights = await extractInsightsFromTranscriptions([TRANSCRIPT], undefined, undefined);

    expect(insights.decisions.length).toBeGreaterThan(0);
    expect(insights.blockers.length).toBeGreaterThan(0);
  });

  it("returns empty buckets when there are no transcripts", async () => {
    const insights = await extractInsightsFromTranscriptions([], undefined, undefined);

    expect(insights).toEqual({
      decisions: [],
      actionItems: [],
      deadlines: [],
      blockers: [],
      milestones: [],
      teamUpdates: [],
    });
  });
});
