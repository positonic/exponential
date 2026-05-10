import type { Document } from "@prisma/client";
import type { EmbeddingSource, EmbeddingSourceType } from "../types";

/**
 * Adapter to wrap Document entities for embedding via KnowledgeService.
 *
 * Unlike Transcription/Resource sources whose text already lives in their
 * respective columns, Document text must be downloaded from S3 and
 * extracted with `~/lib/document-parser` first. To keep `EmbeddingSource`'s
 * `getContent(): string | null` synchronous contract intact, callers
 * (typically the document router's `ingest` mutation) extract the text
 * up-front and pass it into the constructor.
 *
 * Document.uploadedById maps to EmbeddingSource.getUserId() — the user who
 * created/owns the document is the chunk owner.
 *
 * Documents are workspace-scoped (not project-scoped) so getProjectId()
 * returns null; the Document model has no projectId column.
 */
export class DocumentSource implements EmbeddingSource {
  constructor(
    private document: Document,
    private extractedText: string,
  ) {}

  getContent(): string | null {
    return this.extractedText.length > 0 ? this.extractedText : null;
  }

  getSourceType(): EmbeddingSourceType {
    return "document";
  }

  getSourceId(): string {
    return this.document.id;
  }

  getUserId(): string | null {
    return this.document.uploadedById;
  }

  getProjectId(): string | null {
    return null;
  }

  /**
   * Workspace ID this document belongs to. Not part of the EmbeddingSource
   * interface (yet) but exposed for callers that need to scope downstream
   * operations (e.g. search) by workspace.
   */
  getWorkspaceId(): string {
    return this.document.workspaceId;
  }

  getMetadata(): Record<string, unknown> {
    return {
      title: this.document.title,
      description: this.document.description,
      sourceType: this.document.sourceType,
      sourceUri: this.document.sourceUri,
      mimeType: this.document.mimeType,
      byteSize: this.document.byteSize,
      workspaceId: this.document.workspaceId,
    };
  }

  static fromEntity(document: Document, extractedText: string): DocumentSource {
    return new DocumentSource(document, extractedText);
  }
}
