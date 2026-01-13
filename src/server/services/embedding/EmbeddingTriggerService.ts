import type { PrismaClient } from "@prisma/client";
import { getKnowledgeService } from "../KnowledgeService";
import { TranscriptionSource } from "./sources/TranscriptionSource";
import type { EmbeddingResult, EmbeddingStatus } from "./types";

/**
 * Service to handle fire-and-forget embedding triggers.
 * Uses Promise-based async without blocking the caller.
 * Updates TranscriptionSession.embeddingStatus throughout the process.
 */
export class EmbeddingTriggerService {
  constructor(private db: PrismaClient) {}

  /**
   * Trigger embedding for a transcription without blocking.
   * Returns immediately while processing happens in the background.
   */
  triggerTranscriptionEmbedding(transcriptionId: string): void {
    // Fire and forget - don't await
    this.processTranscriptionEmbedding(transcriptionId).catch((error) => {
      console.error(
        `[EmbeddingTriggerService] Background embedding failed for ${transcriptionId}:`,
        error
      );
    });
  }

  /**
   * Internal method that actually processes the embedding.
   * Updates status at each stage for observability.
   */
  private async processTranscriptionEmbedding(
    transcriptionId: string
  ): Promise<void> {
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
      return;
    }

    if (!transcription.transcription) {
      // No content to embed - mark as completed with 0 chunks
      await this.updateEmbeddingStatus(transcriptionId, "completed", null, 0);
      console.log(
        `[EmbeddingTriggerService] Transcription ${transcriptionId} has no content, skipping embedding`
      );
      return;
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
    } else {
      await this.updateEmbeddingStatus(
        transcriptionId,
        "failed",
        result.error ?? "Unknown error"
      );
      console.error(
        `[EmbeddingTriggerService] Failed to embed transcription ${transcriptionId}: ${result.error}`
      );
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
