import type { PrismaClient } from "@prisma/client";
import { after } from "next/server";
import { getKnowledgeService } from "../KnowledgeService";
import { TranscriptionSource } from "./sources/TranscriptionSource";
import { PageSource } from "./sources/PageSource";
import { projectedPageBody } from "~/server/services/databases/projection";
import type { EmbeddingResult, EmbeddingStatus } from "./types";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

/**
 * Settle delay before a Page is (re-)embedded. Page autosave fires roughly once
 * a second while typing; coalescing into one embed after a quiet window keeps us
 * from thrashing the Knowledge index on every keystroke-save (ADR-0033).
 */
const PAGE_EMBED_SETTLE_MS = 8000;

/** How far back the cron backstop looks for pages whose index fell behind. */
const STALE_PAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Pages saved more recently than this are still settling — the save's own trigger owns them. */
const STALE_PAGE_MIN_AGE_MS = 2 * 60 * 1000;
const STALE_PAGE_BATCH = 20;

/**
 * Run `task` after the response is sent, with the platform keeping the function
 * alive until it settles (`after()` is Vercel `waitUntil` under the hood). A bare
 * un-awaited promise or setTimeout can be frozen with the instance and silently
 * dropped. Outside a request scope (scripts, tests) `after()` throws, so the
 * task just runs detached there.
 */
function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

export interface StalePageSweepResult {
  checked: number;
  embedded: number;
  cleared: number;
  failed: number;
}

/**
 * Service to handle background embedding triggers.
 * Work runs after the response via `after()` without blocking the caller.
 * Updates TranscriptionSession.embeddingStatus throughout the process.
 */
export class EmbeddingTriggerService {
  constructor(private db: PrismaClient) {}

  /**
   * (Re-)index a Page after a settle delay, without blocking the save (ADR-0033).
   *
   * Settling is coordinated through the DB, not an in-memory timer map, so it
   * holds across serverless instances: the task fingerprints the page's indexed
   * fields, waits out the settle window, and re-checks. If the content moved on,
   * a later save's trigger owns the re-index and this one stands down. Otherwise
   * it embeds the Markdown `body` — or, when `includeInSearch` is off, the body is
   * empty, or the Page is gone — clears its chunks. `reindexStalePages` (cron)
   * catches anything the platform still drops.
   */
  triggerPageEmbedding(
    pageId: string,
    settleDelayMs: number = PAGE_EMBED_SETTLE_MS,
  ): void {
    runAfterResponse(async () => {
      try {
        await this.settleAndIndexPage(pageId, settleDelayMs);
      } catch (error) {
        console.error(
          `[EmbeddingTriggerService] Background page embedding failed for ${pageId}:`,
          error,
        );
        reportHandledErrorServer(error, {
          area: "embedding.page",
          context: { pageId },
        });
      }
    });
  }

  /** Immediately drop a Page's chunks (e.g. on delete). */
  async clearPageChunks(pageId: string): Promise<void> {
    await getKnowledgeService(this.db).deleteChunks("page", pageId);
  }

  /**
   * Drop many pages' chunks in one statement — a database's rows going with
   * it (ADR-0078). A settling embed for one of them finds the page gone and
   * clears instead.
   */
  async clearPageChunksMany(pageIds: readonly string[]): Promise<void> {
    if (pageIds.length === 0) return;
    await this.db.$executeRaw`
      DELETE FROM "KnowledgeChunk"
      WHERE "sourceType" = 'page' AND "sourceId" = ANY(${[...pageIds]}::text[])
    `;
  }

  /**
   * Cron backstop, two kinds of candidate, oldest first and bounded per run:
   *
   * - A searchable Page with a body whose chunks predate its last save (a
   *   dropped or failed trigger). Only saves inside the lookback window qualify,
   *   so a page that can never embed isn't retried forever.
   * - A Page holding chunks it shouldn't — opted out of search, or emptied —
   *   that are older than its last save. No lookback: clearing ends the
   *   candidacy, so this also cleans up backlog left from before the sweep
   *   existed or while the cron wasn't running.
   *
   * `indexPage` then decides on the projection (ADR-0078 §7), so a database row
   * with properties but no prose is re-embedded rather than cleared, and its
   * fresh chunks end its candidacy. Such a row that was never indexed is left to
   * its own trigger.
   */
  async reindexStalePages(
    now: Date = new Date(),
    limit: number = STALE_PAGE_BATCH,
  ): Promise<StalePageSweepResult> {
    const since = new Date(now.getTime() - STALE_PAGE_LOOKBACK_MS);
    const settledBefore = new Date(now.getTime() - STALE_PAGE_MIN_AGE_MS);
    const stale = await this.db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "KnowledgePage" p
      WHERE p."updatedAt" < ${settledBefore}
        AND NOT EXISTS (
          SELECT 1 FROM "KnowledgeChunk" c
          WHERE c."sourceType" = 'page' AND c."sourceId" = p.id
            AND c."createdAt" >= p."updatedAt"
        )
        AND (
          (p."updatedAt" > ${since}
            AND p."includeInSearch"
            AND btrim(coalesce(p.body, '')) <> '')
          OR
          ((NOT p."includeInSearch" OR btrim(coalesce(p.body, '')) = '')
            AND EXISTS (
              SELECT 1 FROM "KnowledgeChunk" c
              WHERE c."sourceType" = 'page' AND c."sourceId" = p.id
            ))
        )
      ORDER BY p."updatedAt" ASC
      LIMIT ${limit}
    `;

    const result: StalePageSweepResult = {
      checked: stale.length,
      embedded: 0,
      cleared: 0,
      failed: 0,
    };
    for (const { id } of stale) {
      try {
        result[await this.indexPage(id)] += 1;
      } catch (error) {
        result.failed += 1;
        console.error(
          `[EmbeddingTriggerService] Stale page re-index failed for ${id}:`,
          error,
        );
      }
    }
    return result;
  }

  private async settleAndIndexPage(
    pageId: string,
    settleDelayMs: number,
  ): Promise<void> {
    const before = await this.readPageIndexKey(pageId);
    await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
    if ((await this.readPageIndexKey(pageId)) !== before) return;
    await this.indexPage(pageId);
  }

  /**
   * A fingerprint of the fields whose change means "re-index this page" —
   * search inclusion, project, and the body (hashed in the DB, so the check
   * stays tiny on every autosave of a large page). Null when the page is gone.
   */
  private async readPageIndexKey(pageId: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<{ key: string }[]>`
      SELECT concat_ws('|', "includeInSearch"::text, coalesce("projectId", ''), md5(coalesce(body, ''))) AS key
      FROM "KnowledgePage" WHERE id = ${pageId}
    `;
    return rows[0]?.key ?? null;
  }

  /** Embed or clear one Page from a fresh read. */
  private async indexPage(
    pageId: string,
  ): Promise<"embedded" | "cleared" | "failed"> {
    const knowledgeService = getKnowledgeService(this.db);
    const page = await this.db.knowledgePage.findUnique({
      where: { id: pageId },
    });

    // Gone or opted out → ensure no stale chunks linger.
    if (!page || !page.includeInSearch) {
      await knowledgeService.deleteChunks("page", pageId);
      return "cleared";
    }
    // What gets indexed is what a reader sees (ADR-0078 §7): a database
    // block's table, or a row's property header, not the stored marker. A
    // row with values and no prose is content, so emptiness is judged on
    // the projection, not the stored body.
    const body = await projectedPageBody(this.db, page);
    if (!body || body.trim() === "") {
      await knowledgeService.deleteChunks("page", pageId);
      return "cleared";
    }
    const result = await knowledgeService.embedSource(PageSource.fromEntity({ ...page, body }));
    if (result.success) {
      console.log(
        `[EmbeddingTriggerService] Embedded page ${pageId}: ${result.chunkCount} chunks`,
      );
      return "embedded";
    }
    console.error(
      `[EmbeddingTriggerService] Failed to embed page ${pageId}: ${result.error}`,
    );
    reportHandledErrorServer(new Error(result.error ?? "Unknown embedding error"), {
      area: "embedding.page",
      context: { pageId },
    });
    return "failed";
  }

  /**
   * Trigger embedding for a transcription without blocking.
   * Returns immediately while processing happens after the response.
   */
  triggerTranscriptionEmbedding(transcriptionId: string): void {
    runAfterResponse(async () => {
      try {
        await this.embedTranscriptionNow(transcriptionId);
      } catch (error) {
        console.error(
          `[EmbeddingTriggerService] Background embedding failed for ${transcriptionId}:`,
          error
        );
      }
    });
  }

  /**
   * Embed a transcription inline and resolve with its final status. Used
   * directly by the meeting embedding sweep, which must finish its work inside
   * the cron request rather than fire-and-forget.
   * Updates status at each stage for observability.
   */
  async embedTranscriptionNow(
    transcriptionId: string
  ): Promise<EmbeddingStatus> {
    const knowledgeService = getKnowledgeService(this.db);

    // 1. Mark as processing
    await this.updateEmbeddingStatus(transcriptionId, "processing");

    // 2. Fetch the transcription
    const transcription = await this.db.transcriptionSession.findUnique({
      where: { id: transcriptionId },
    });

    if (!transcription) {
      await this.updateEmbeddingStatus(
        transcriptionId,
        "failed",
        "Transcription not found"
      );
      return "failed";
    }

    if (!transcription.transcription) {
      // No content to embed - mark as completed with 0 chunks
      await this.updateEmbeddingStatus(transcriptionId, "completed", null, 0);
      console.log(
        `[EmbeddingTriggerService] Transcription ${transcriptionId} has no content, skipping embedding`
      );
      return "completed";
    }

    // 3. Create source adapter and embed
    const source = TranscriptionSource.fromEntity(transcription);
    const result: EmbeddingResult = await knowledgeService.embedSource(source);

    // 4. Update final status
    if (result.success) {
      await this.updateEmbeddingStatus(
        transcriptionId,
        "completed",
        null,
        result.chunkCount
      );
      console.log(
        `[EmbeddingTriggerService] Successfully embedded transcription ${transcriptionId}: ${result.chunkCount} chunks`
      );
      return "completed";
    } else {
      await this.updateEmbeddingStatus(
        transcriptionId,
        "failed",
        result.error ?? "Unknown error"
      );
      console.error(
        `[EmbeddingTriggerService] Failed to embed transcription ${transcriptionId}: ${result.error}`
      );
      return "failed";
    }
  }

  /**
   * Helper to update embedding status on TranscriptionSession
   */
  private async updateEmbeddingStatus(
    transcriptionId: string,
    status: EmbeddingStatus,
    error?: string | null,
    chunkCount?: number
  ): Promise<void> {
    try {
      await this.db.transcriptionSession.update({
        where: { id: transcriptionId },
        data: {
          embeddingStatus: status,
          embeddingError: error ?? null,
          embeddedAt: status === "completed" ? new Date() : null,
          chunkCount: chunkCount ?? null,
        },
      });
    } catch (updateError) {
      console.error(
        `[EmbeddingTriggerService] Failed to update embedding status for ${transcriptionId}:`,
        updateError
      );
    }
  }
}

// Factory function with singleton pattern
let embeddingTriggerInstance: EmbeddingTriggerService | null = null;

export function getEmbeddingTriggerService(
  db: PrismaClient
): EmbeddingTriggerService {
  if (!embeddingTriggerInstance) {
    embeddingTriggerInstance = new EmbeddingTriggerService(db);
  }
  return embeddingTriggerInstance;
}
