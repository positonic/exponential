/**
 * `transcription.getMeetingCards`: the card-shaped meeting list. It must
 * apply the same visibility and filters as `getAllTranscriptions`, keep the
 * transcript / notes / Fireflies JSON bodies on the server, and hand the
 * card a pre-parsed transcript peek instead. Mocked Prisma.
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
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));

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

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    sessionId: "s-1",
    title: "Standup",
    description: null,
    summary: null,
    createdAt: new Date("2026-09-10T09:00:00Z"),
    updatedAt: new Date("2026-09-10T09:00:00Z"),
    meetingDate: null,
    userId: USER_ID,
    projectId: null,
    workspaceId: "ws-1",
    archivedAt: null,
    processedAt: null,
    actionsSavedAt: null,
    sourceIntegrationId: null,
    occurrenceId: null,
    durationSeconds: null,
    participantCount: null,
    transcription: null,
    project: null,
    sourceIntegration: null,
    actions: [],
    participants: [],
    occurrence: null,
    ...overrides,
  };
}

describe("transcription.getMeetingCards", () => {
  let db: DeepMockProxy<PrismaClient>;
  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
    db.transcriptionSession.findMany.mockResolvedValue([]);
  });

  it("applies the same visibility rule and filters as getAllTranscriptions", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    await caller.transcription.getMeetingCards({
      workspaceId: "ws-1",
      ceremonyId: "cer-1",
      meetingType: "mine",
    });

    const args = db.transcriptionSession.findMany.mock.calls[0]![0]!;
    const and = (args.where as { AND: unknown[] }).AND;
    expect(and[0]).toHaveProperty("OR"); // buildTranscriptionAccessWhere stays first
    expect(and).toContainEqual({ archivedAt: null });
    expect(and).toContainEqual({
      OR: [{ workspaceId: "ws-1" }, { project: { workspaceId: "ws-1" } }],
    });
    expect(and).toContainEqual({ occurrence: { ceremonyId: "cer-1" } });
    expect(and).toContainEqual({
      OR: [{ userId: USER_ID }, { participants: { some: { userId: USER_ID } } }],
    });
  });

  it("selects the card fields only — no notes, sentencesJson or analyticsJson", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    await caller.transcription.getMeetingCards({ workspaceId: "ws-1" });

    const args = db.transcriptionSession.findMany.mock.calls[0]![0]!;
    const select = args.select as Record<string, unknown>;
    expect(args.include).toBeUndefined();
    expect(select.notes).toBeUndefined();
    expect(select.sentencesJson).toBeUndefined();
    expect(select.analyticsJson).toBeUndefined();
    expect(select.screenshots).toBeUndefined();
    for (const key of ["title", "summary", "archivedAt", "participants", "actions", "occurrence"]) {
      expect(select[key]).toBeDefined();
    }
  });

  it("strips the transcript and returns a two-turn peek with the total count", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([
      row({
        transcription: "Alice: Morning all.\nBen: Morning.\nCarla: Shall we start?",
      }) as never,
    ]);
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    const [card] = await caller.transcription.getMeetingCards({ workspaceId: "ws-1" });

    expect(card).not.toHaveProperty("transcription");
    expect(card!.hasTranscript).toBe(true);
    expect(card!.transcriptTurnCount).toBe(3);
    expect(card!.transcriptPreview.map((t) => [t.speaker, t.text])).toEqual([
      ["Alice", "Morning all."],
      ["Ben", "Morning."],
    ]);
  });

  it("reports no transcript for empty or whitespace bodies", async () => {
    db.transcriptionSession.findMany.mockResolvedValue([
      row({ id: "m-1", transcription: null }) as never,
      row({ id: "m-2", transcription: "   " }) as never,
    ]);
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    const cards = await caller.transcription.getMeetingCards({ workspaceId: "ws-1" });

    expect(cards.map((c) => c.hasTranscript)).toEqual([false, false]);
    expect(cards.map((c) => c.transcriptPreview)).toEqual([[], []]);
  });

  it("returns an empty list for the customer and internal tabs without querying", async () => {
    const caller = createMockCaller({ userId: USER_ID, db: db as unknown as PrismaClient });
    await expect(caller.transcription.getMeetingCards({ meetingType: "customer" })).resolves.toEqual([]);
    await expect(caller.transcription.getMeetingCards({ meetingType: "internal" })).resolves.toEqual([]);
    expect(db.transcriptionSession.findMany).not.toHaveBeenCalled();
  });
});
