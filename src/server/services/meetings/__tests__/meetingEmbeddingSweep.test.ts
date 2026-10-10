/**
 * The Meeting embedding sweep is the one route by which manual meetings,
 * device recordings, Fireflies bulk syncs and edited transcripts reach the
 * Knowledge Base. These tests pin what it selects, that it re-stamps chunk
 * scope before embedding, and that one failure doesn't sink the batch. The
 * embedder is stubbed — no DB, no OpenAI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { embedTranscriptionNowMock } = vi.hoisted(() => ({
  embedTranscriptionNowMock: vi.fn(),
}));

vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ embedTranscriptionNow: embedTranscriptionNowMock }),
}));

import { runMeetingEmbeddingSweep } from "../meetingEmbeddingSweep";

const db = mockDeep<PrismaClient>();

/** The SQL text of a tagged-template Prisma call, parameters elided. */
function sqlOf(call: unknown[] | undefined): string {
  return ((call?.[0] as string[] | undefined) ?? []).join("?");
}

describe("runMeetingEmbeddingSweep", () => {
  beforeEach(() => {
    mockReset(db);
    embedTranscriptionNowMock.mockReset();
    db.$executeRaw.mockResolvedValue(4 as never);
    db.$queryRaw.mockResolvedValue([] as never);
  });

  it("re-stamps transcript chunk scope from the meeting, before selecting", async () => {
    const result = await runMeetingEmbeddingSweep(db);

    expect(result.chunksRescoped).toBe(4);
    const update = sqlOf(db.$executeRaw.mock.calls[0]);
    expect(update).toContain('UPDATE "KnowledgeChunk"');
    expect(update).toContain('"workspaceId" = ts."workspaceId"');
    expect(update).toContain('"projectId" = ts."projectId"');
    expect(update).toContain("kc.\"sourceType\" = 'transcription'");
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.$queryRaw.mock.invocationCallOrder[0]!,
    );
  });

  it("selects only placed, live, non-empty, settled meetings that need indexing", async () => {
    await runMeetingEmbeddingSweep(db);

    const select = sqlOf(db.$queryRaw.mock.calls[0]);
    expect(select).toContain('ts."workspaceId" IS NOT NULL');
    expect(select).toContain('ts."archivedAt" IS NULL');
    expect(select).toContain("btrim(ts.transcription) <> ''");
    expect(select).toContain('ts."updatedAt" < ?');
    expect(select).toContain("ts.\"embeddingStatus\" = 'pending'");
    expect(select).toContain("ts.\"embeddingStatus\" = 'processing'");
    // Never-embedded rows only when they have no chunks yet: historical
    // Backfill runs left chunks without touching embeddingStatus.
    expect(select).toContain("COALESCE(ts.\"embeddingStatus\", 'none') = 'none'");
    expect(select).toContain('NOT EXISTS');
    // `failed` rows are deliberately not retried automatically.
    expect(select).not.toContain("'failed'");
  });

  it("embeds each candidate and tallies outcomes, surviving a throw", async () => {
    db.$queryRaw.mockResolvedValue([{ id: "m1" }, { id: "m2" }, { id: "m3" }] as never);
    embedTranscriptionNowMock
      .mockResolvedValueOnce("completed")
      .mockRejectedValueOnce(new Error("openai down"))
      .mockResolvedValueOnce("failed");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await runMeetingEmbeddingSweep(db);

    expect(embedTranscriptionNowMock.mock.calls.map((c) => c[0])).toEqual(["m1", "m2", "m3"]);
    expect(result).toEqual({ chunksRescoped: 4, candidates: 3, embedded: 1, failed: 2 });
  });
});
