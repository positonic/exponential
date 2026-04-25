import type { TranscriptionSession } from "@prisma/client";
import type { EmbeddingSource, EmbeddingSourceType } from "../types";

/**
 * Adapter to wrap TranscriptionSession entities for embedding.
 */
export class TranscriptionSource implements EmbeddingSource {
  constructor(private transcription: TranscriptionSession) {}

  getContent(): string | null {
    return this.transcription.transcription;
  }

  getSourceType(): EmbeddingSourceType {
    return "transcription";
  }

  getSourceId(): string {
    return this.transcription.id;
  }

  getUserId(): string | null {
    return this.transcription.userId;
  }

  getProjectId(): string | null {
    return this.transcription.projectId;
  }

  getMetadata(): Record<string, unknown> {
    return {
      title: this.transcription.title,
      meetingDate: this.transcription.meetingDate,
      sessionId: this.transcription.sessionId,
      sourceIntegrationId: this.transcription.sourceIntegrationId,
    };
  }

  static fromEntity(transcription: TranscriptionSession): TranscriptionSource {
    return new TranscriptionSource(transcription);
  }
}
