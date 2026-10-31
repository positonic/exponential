import type { PrismaClient } from "@prisma/client";
import { getKnowledgeService } from "../KnowledgeService";
import { TranscriptionSource } from "./sources/TranscriptionSource";
import { PageSource } from "./sources/PageSource";
import { projectedPageBody } from "~/server/services/databases/projection";
import type { EmbeddingResult, EmbeddingStatus } from "./types";

/**
 * Settle delay before a Page is (re-)embedded. Page autosave fires roughly once
 * a second while typing; coalescing into one embed after a quiet window keeps us
 * from thrashing the Knowledge index on every keystroke-save (ADR-0033).
 */
const PAGE_EMBED_SETTLE_MS = 8000;

/**
 * Service to handle fire-and-forget embedding triggers.
 * Uses Promise-based async without blocking the caller.
 * Updates TranscriptionSession.embeddingStatus throughout the process.
 */
export class EmbeddingTriggerService {
  constructor(private db: PrismaClient) {}

  /** Per-page debounce timers, so rapid autosaves coalesce into one embed. */
  private pageEmbedTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * (Re-)index a Page after a settle delay, without blocking the save (ADR-0033).
   * Debounced per page id; the deferred run reads the Page fresh and either
   * embeds its Markdown `body` or — when `includeInSearch` is off, the body is
   * empty, or the Page is gone — clears its chunks. Fire-and-forget.
   */
  triggerPageEmbedding(
    pageId: string,
    settleDelayMs: number = PAGE_EMBED_SETTLE_MS,
  ): void {
    const existing = this.pageEmbedTimers.get(pageId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pageEmbedTimers.delete(pageId);
      this.processPageEmbedding(pageId).catch((error) => {
        console.error(
          `[EmbeddingTriggerService] Background page embedding failed for ${pageId}:`,
          error,
        );
      });
    }, settleDelayMs);
    this.pageEmbedTimers.set(pageId, timer);
  }

  /** Immediately drop a Page's chunks (e.g. on delete). Fire-and-forget safe. */
  async clearPageChunks(pageId: string): Promise<void> {
    this.cancelPageEmbedding(pageId);
    await getKnowledgeService(this.db).deleteChunks("page", pageId);
  }

  /**
   * Drop many pages' chunks in one statement — a database's rows going with
   * it (ADR-0078). Pending embeds for those pages are cancelled first.
   */
  async clearPageChunksMany(pageIds: readonly string[]): Promise<void> {
    if (pageIds.length === 0) return;
    for (const pageId of pageIds) this.cancelPageEmbedding(pageId);
    await this.db.$executeRaw`
      DELETE FROM "KnowledgeChunk"
      WHERE "sourceType" = 'page' AND "sourceId" = ANY(${[...pageIds]}::text[])
    `;
  }

  private cancelPageEmbedding(pageId: string): void {
    const existing = this.pageEmbedTimers.get(pageId);
    if (existing) {
      clearTimeout(existing);
      this.pageEmbedTimers.delete(pageId);
    }
  }

  private async processPageEmbedding(pageId: string): Promise<void> {
    const knowledgeService = getKnowledgeService(this.db);
    const page = await this.db.knowledgePage.findUnique({
      where: { id: pageId },
    });

    // Gone, opted out, or empty → ensure no stale chunks linger.
    if (!page || !page.includeInSearch || !page.body || page.body.trim() === "") {
      await knowledgeService.deleteChunks("page", pageId);
      return;
    }

    // What gets indexed is what a reader sees (ADR-0078 §7): a database
    // block's table, or a row's property header, not the stored marker.
    const body = await projectedPageBody(this.db, page);
    const result = await knowledgeService.embedSource(PageSource.fromEntity({ ...page, body }));
    if (result.success) {
      console.log(
        `[EmbeddingTriggerService] Embedded page ${pageId}: ${result.chunkCount} chunks`,
      );
    } else {
      console.error(
        `[EmbeddingTriggerService] Failed to embed page ${pageId}: ${result.error}`,
      );
    }
  }

  /**
   * Trigger embedding for a transcription without blocking.
   * Returns immediately while processing happens in the background.
   */
  triggerTranscriptionEmbedding(transcriptionId: string): void {
    // Fire and forget - don't await
    this.embedTranscriptionNow(transcriptionId).catch((error) => {
      console.error(
        `[EmbeddingTriggerService] Background embedding failed for ${transcriptionId}:`,
        error
      );
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
