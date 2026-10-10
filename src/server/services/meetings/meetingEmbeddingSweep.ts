import type { PrismaClient } from "@prisma/client";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";

/**
 * Knowledge-base embedding sweep for Meetings.
 *
 * Only the Fireflies webhook embeds a Meeting the moment it lands, and even
 * that is post-response fire-and-forget, which a serverless function can drop.
 * Manual meetings, device recordings, Fireflies bulk syncs and edited
 * transcripts were never embedded at all unless someone pressed "Backfill" on
 * the Knowledge Base page. This sweep makes every ingest path converge: it runs
 * inside a cron request (no fire-and-forget) and
 *
 *   1. re-stamps the scope of existing transcript chunks whose Meeting has
 *      since moved. Chunks copy `workspaceId`/`projectId` when they are
 *      written, and Knowledge search filters on the chunk's own
 *      `workspaceId` — so a Meeting that landed workspace-less (every Fireflies
 *      import does) and was placed later stayed unsearchable forever;
 *   2. embeds a bounded batch of Meetings that need it: never embedded,
 *      marked `pending` by a transcript write, or stuck in `processing` after
 *      a killed run.
 *
 * Idempotent and safe to re-run. `failed` rows are left alone so a transcript
 * that can't be embedded doesn't burn the batch every run; the Knowledge Base
 * page's Backfill still retries them by hand.
 */

/** Default number of Meetings embedded per sweep (bounds OpenAI cost/runtime). */
const DEFAULT_SWEEP_LIMIT = 25;

/**
 * How long a Meeting's row must sit untouched before it is embedded. The device
 * recorder appends to the transcript as it goes, so embedding mid-recording
 * would index half a meeting; waiting for a quiet row embeds it once, whole.
 */
const DEFAULT_SETTLE_MS = 10 * 60 * 1000;

/** A `processing` row older than this was abandoned by a killed run. */
const STUCK_PROCESSING_MS = 60 * 60 * 1000;

export interface MeetingEmbeddingSweepOptions {
  /** Max Meetings to embed in one sweep. Defaults to {@link DEFAULT_SWEEP_LIMIT}. */
  limit?: number;
  /** Quiet period before a Meeting is embedded. Defaults to {@link DEFAULT_SETTLE_MS}. */
  settleMs?: number;
}

export interface MeetingEmbeddingSweepResult {
  /** Transcript chunks whose workspace/project scope was re-stamped. */
  chunksRescoped: number;
  /** Meetings the selector returned for this sweep. */
  candidates: number;
  /** Meetings embedded successfully. */
  embedded: number;
  /** Meetings whose embedding failed (left as `failed`). */
  failed: number;
}

export async function runMeetingEmbeddingSweep(
  db: PrismaClient,
  options: MeetingEmbeddingSweepOptions = {},
): Promise<MeetingEmbeddingSweepResult> {
  const limit = options.limit ?? DEFAULT_SWEEP_LIMIT;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const now = Date.now();
  const settledBefore = new Date(now - settleMs);
  const stuckBefore = new Date(now - STUCK_PROCESSING_MS);

  const chunksRescoped = await db.$executeRaw`
    UPDATE "KnowledgeChunk" kc
    SET "workspaceId" = ts."workspaceId", "projectId" = ts."projectId"
    FROM "TranscriptionSession" ts
    WHERE kc."sourceType" = 'transcription'
      AND kc."sourceId" = ts.id
      AND (kc."workspaceId" IS DISTINCT FROM ts."workspaceId"
        OR kc."projectId" IS DISTINCT FROM ts."projectId")
  `;

  // Workspace-less Meetings are skipped: Knowledge search is always workspace
  // scoped, so their chunks could never be found. Once placed, they qualify.
  const candidates = await db.$queryRaw<{ id: string }[]>`
    SELECT ts.id
    FROM "TranscriptionSession" ts
    WHERE ts."workspaceId" IS NOT NULL
      AND ts."archivedAt" IS NULL
      AND ts.transcription IS NOT NULL
      AND btrim(ts.transcription) <> ''
      AND ts."updatedAt" < ${settledBefore}
      AND (
        ts."embeddingStatus" = 'pending'
        OR (ts."embeddingStatus" = 'processing' AND ts."updatedAt" < ${stuckBefore})
        OR (
          COALESCE(ts."embeddingStatus", 'none') = 'none'
          AND NOT EXISTS (
            SELECT 1 FROM "KnowledgeChunk" kc
            WHERE kc."sourceType" = 'transcription' AND kc."sourceId" = ts.id
          )
        )
      )
    ORDER BY ts."updatedAt" DESC
    LIMIT ${limit}
  `;

  const result: MeetingEmbeddingSweepResult = {
    chunksRescoped,
    candidates: candidates.length,
    embedded: 0,
    failed: 0,
  };

  const trigger = getEmbeddingTriggerService(db);
  for (const { id } of candidates) {
    try {
      const status = await trigger.embedTranscriptionNow(id);
      if (status === "completed") result.embedded++;
      else result.failed++;
    } catch (error) {
      // One bad transcript must not sink the rest of the batch.
      console.error(`[meetingEmbeddingSweep] Embedding failed for ${id}:`, error);
      result.failed++;
    }
  }

  return result;
}
