import type { PrismaClient } from "@prisma/client";
import { getKnowledgeService } from "~/server/services/KnowledgeService";

/**
 * Platform-wide view of the knowledge index (KnowledgeChunk), for the admin
 * panel's /admin/knowledge-index page. Unlike the per-user
 * `mastra.getEmbeddingStats` this replaces, every number here spans all users
 * and workspaces.
 *
 * "Has text" means the source column contains at least one non-whitespace
 * character — the same thing `KnowledgeService.embedSource` needs to produce a
 * chunk. The POSIX class is used rather than `\S` so the pattern survives the
 * tagged-template string cooking unchanged.
 */

export interface SourceIndexStats {
  /** Rows whose text column is non-empty. */
  total: number;
  /** Of those, rows with at least one KnowledgeChunk. */
  indexed: number;
  /** total - indexed, never negative. */
  pending: number;
  /** Rows that have chunks but no text any more (text cleared after indexing). */
  chunkedWithoutText: number;
}

export interface TranscriptionIndexStats extends SourceIndexStats {
  /** Pending rows with no userId; embedding refuses these, so backfill skips them. */
  pendingWithoutOwner: number;
  /**
   * Indexed rows with no Workspace (Personal meetings). Knowledge search is
   * always workspace-scoped, so these have chunks no search can return.
   */
  indexedWithoutWorkspace: number;
}

export interface ChunkSourceBreakdown {
  sourceType: string;
  chunks: number;
  /** Distinct source rows that have chunks. */
  sources: number;
  /** Chunks whose source row no longer exists. */
  orphanChunks: number;
  /** Distinct missing source rows those orphan chunks point at. */
  orphanSources: number;
}

export interface KnowledgeIndexStats {
  transcriptions: TranscriptionIndexStats;
  resources: SourceIndexStats;
  chunksBySource: ChunkSourceBreakdown[];
  totalChunks: number;
  orphanChunks: number;
  orphanSources: number;
}

interface SourceRow {
  sourceType: string;
  total: number;
  indexed: number;
  pendingWithoutOwner: number;
  /** Transcriptions only; 0 for other sources. */
  indexedWithoutWorkspace: number;
  chunkedWithoutText: number;
}

const nonNegative = (n: number): number => Math.max(0, n);

function toSourceStats(row: SourceRow | undefined): SourceIndexStats {
  const total = nonNegative(row?.total ?? 0);
  const indexed = Math.min(total, nonNegative(row?.indexed ?? 0));
  return {
    total,
    indexed,
    pending: total - indexed,
    chunkedWithoutText: nonNegative(row?.chunkedWithoutText ?? 0),
  };
}

/**
 * Shape raw query rows into the stats the admin page shows. Pure, so the
 * never-negative guarantees can be unit-tested without a database.
 */
export function summarizeKnowledgeIndex(
  sourceRows: SourceRow[],
  chunkRows: ChunkSourceBreakdown[],
): KnowledgeIndexStats {
  const transcriptionRow = sourceRows.find((r) => r.sourceType === "transcription");
  const transcriptions = toSourceStats(transcriptionRow);
  const chunksBySource = chunkRows.map((r) => ({
    sourceType: r.sourceType,
    chunks: nonNegative(r.chunks),
    sources: nonNegative(r.sources),
    orphanChunks: nonNegative(r.orphanChunks),
    orphanSources: nonNegative(r.orphanSources),
  }));

  return {
    transcriptions: {
      ...transcriptions,
      pendingWithoutOwner: Math.min(
        transcriptions.pending,
        nonNegative(transcriptionRow?.pendingWithoutOwner ?? 0),
      ),
      indexedWithoutWorkspace: Math.min(
        transcriptions.indexed,
        nonNegative(transcriptionRow?.indexedWithoutWorkspace ?? 0),
      ),
    },
    resources: toSourceStats(sourceRows.find((r) => r.sourceType === "resource")),
    chunksBySource,
    totalChunks: chunksBySource.reduce((sum, r) => sum + r.chunks, 0),
    orphanChunks: chunksBySource.reduce((sum, r) => sum + r.orphanChunks, 0),
    orphanSources: chunksBySource.reduce((sum, r) => sum + r.orphanSources, 0),
  };
}

export async function getKnowledgeIndexStats(db: PrismaClient): Promise<KnowledgeIndexStats> {
  const sourceRows = await db.$queryRaw<SourceRow[]>`
    SELECT 'transcription' AS "sourceType",
      COUNT(*) FILTER (WHERE x.has_text)::int AS "total",
      COUNT(*) FILTER (WHERE x.has_text AND x.has_chunks)::int AS "indexed",
      COUNT(*) FILTER (WHERE x.has_text AND NOT x.has_chunks AND NOT x.has_owner)::int AS "pendingWithoutOwner",
      COUNT(*) FILTER (WHERE x.has_text AND x.has_chunks AND NOT x.has_workspace)::int AS "indexedWithoutWorkspace",
      COUNT(*) FILTER (WHERE NOT x.has_text AND x.has_chunks)::int AS "chunkedWithoutText"
    FROM (
      SELECT
        COALESCE(t."transcription" ~ '[^[:space:]]', false) AS has_text,
        t."userId" IS NOT NULL AS has_owner,
        t."workspaceId" IS NOT NULL AS has_workspace,
        EXISTS (
          SELECT 1 FROM "KnowledgeChunk" kc
          WHERE kc."sourceType" = 'transcription' AND kc."sourceId" = t."id"
        ) AS has_chunks
      FROM "TranscriptionSession" t
    ) x
    UNION ALL
    SELECT 'resource' AS "sourceType",
      COUNT(*) FILTER (WHERE x.has_text)::int AS "total",
      COUNT(*) FILTER (WHERE x.has_text AND x.has_chunks)::int AS "indexed",
      0 AS "pendingWithoutOwner",
      0 AS "indexedWithoutWorkspace",
      COUNT(*) FILTER (WHERE NOT x.has_text AND x.has_chunks)::int AS "chunkedWithoutText"
    FROM (
      SELECT
        COALESCE(r."content" ~ '[^[:space:]]', false) AS has_text,
        EXISTS (
          SELECT 1 FROM "KnowledgeChunk" kc
          WHERE kc."sourceType" = 'resource' AND kc."sourceId" = r."id"
        ) AS has_chunks
      FROM "Resource" r
    ) x
  `;

  // Group chunks per source row first, so the existence check runs once per
  // source rather than once per chunk.
  const chunkRows = await db.$queryRaw<ChunkSourceBreakdown[]>`
    WITH per_source AS (
      SELECT kc."sourceType", kc."sourceId", COUNT(*) AS chunks
      FROM "KnowledgeChunk" kc
      GROUP BY kc."sourceType", kc."sourceId"
    ),
    flagged AS (
      SELECT s."sourceType", s.chunks,
        CASE s."sourceType"
          WHEN 'transcription' THEN NOT EXISTS (SELECT 1 FROM "TranscriptionSession" t WHERE t."id" = s."sourceId")
          WHEN 'resource' THEN NOT EXISTS (SELECT 1 FROM "Resource" r WHERE r."id" = s."sourceId")
          WHEN 'page' THEN NOT EXISTS (SELECT 1 FROM "KnowledgePage" p WHERE p."id" = s."sourceId")
          WHEN 'document' THEN NOT EXISTS (SELECT 1 FROM "Document" d WHERE d."id" = s."sourceId")
          ELSE false
        END AS orphan
      FROM per_source s
    )
    SELECT f."sourceType",
      COALESCE(SUM(f.chunks), 0)::int AS "chunks",
      COUNT(*)::int AS "sources",
      COALESCE(SUM(f.chunks) FILTER (WHERE f.orphan), 0)::int AS "orphanChunks",
      COUNT(*) FILTER (WHERE f.orphan)::int AS "orphanSources"
    FROM flagged f
    GROUP BY f."sourceType"
    ORDER BY f."sourceType"
  `;

  return summarizeKnowledgeIndex(sourceRows, chunkRows);
}

export interface BackfillItemResult {
  id: string;
  title: string | null;
  chunkCount: number;
  error?: string;
}

export interface BackfillResult {
  /** Rows attempted in this batch. */
  processed: number;
  /** Rows that now have at least one chunk. */
  successful: number;
  /** Rows that embedded without error but produced no chunks. */
  empty: number;
  /** Rows whose embedding threw. */
  failed: number;
  attemptedIds: string[];
  /** Indexable pending rows left, excluding `excludeIds` and this batch's attempts. */
  remaining: number;
  results: BackfillItemResult[];
}

/**
 * Embed the newest transcriptions that have text and no chunks yet.
 *
 * The "no chunks" filter lives in the query (NOT EXISTS), so each batch always
 * reaches the next unindexed rows however old they are. The previous per-user
 * backfill fetched the newest `limit * 2` rows and filtered afterwards, which
 * stalled at zero once the newest rows were indexed.
 *
 * `excludeIds` lets the caller skip rows it has already tried (failed, or
 * produced no chunks) so a client loop can't spin on the same row forever.
 */
export async function backfillKnowledgeIndex(
  db: PrismaClient,
  input: { limit: number; excludeIds: string[] },
): Promise<BackfillResult> {
  const candidates = await db.$queryRaw<{ id: string; title: string | null }[]>`
    SELECT t."id", t."title"
    FROM "TranscriptionSession" t
    WHERE t."transcription" ~ '[^[:space:]]'
      AND t."userId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "KnowledgeChunk" kc
        WHERE kc."sourceType" = 'transcription' AND kc."sourceId" = t."id"
      )
      AND t."id" <> ALL(${input.excludeIds}::text[])
    ORDER BY t."createdAt" DESC
    LIMIT ${input.limit}
  `;

  const knowledgeService = getKnowledgeService(db);
  const results: BackfillItemResult[] = [];

  for (const candidate of candidates) {
    try {
      const chunkCount = await knowledgeService.embedTranscription(candidate.id);
      results.push({ id: candidate.id, title: candidate.title, chunkCount });
    } catch (error) {
      console.error(`[backfillKnowledgeIndex] Failed for ${candidate.id}:`, error);
      results.push({
        id: candidate.id,
        title: candidate.title,
        chunkCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const attemptedIds = results.map((r) => r.id);
  const skipIds = [...input.excludeIds, ...attemptedIds];

  const [remainingRow] = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS "count"
    FROM "TranscriptionSession" t
    WHERE t."transcription" ~ '[^[:space:]]'
      AND t."userId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "KnowledgeChunk" kc
        WHERE kc."sourceType" = 'transcription' AND kc."sourceId" = t."id"
      )
      AND t."id" <> ALL(${skipIds}::text[])
  `;

  return {
    processed: results.length,
    successful: results.filter((r) => !r.error && r.chunkCount > 0).length,
    empty: results.filter((r) => !r.error && r.chunkCount === 0).length,
    failed: results.filter((r) => r.error).length,
    attemptedIds,
    remaining: Math.max(0, remainingRow?.count ?? 0),
    results,
  };
}
