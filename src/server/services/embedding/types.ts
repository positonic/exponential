/**
 * Embedding types and interfaces for the knowledge base system.
 * Designed to be extensible for future source types.
 */

/**
 * Source types that can be embedded into the knowledge base.
 * Extensible for future sources like notes, Slack messages, etc.
 */
export type EmbeddingSourceType =
  | "transcription"
  | "resource"
  | "document"
  | "page";

/**
 * Status of the embedding process for a source.
 */
export type EmbeddingStatus =
  | "none"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/** A part of a source to chunk on its own, with context repeated on every chunk. */
export interface EmbeddingSection {
  context: string;
  text: string;
}

/**
 * Interface for any source that can be embedded.
 * Implement this for new source types to enable automatic embedding.
 */
export interface EmbeddingSource {
  /** Get the text content to embed */
  getContent(): string | null;

  /**
   * Optional: the content split into sections, each with a line naming what it
   * belongs to. Chunks then stay meaningful when retrieved alone. Without this
   * the whole of `getContent()` is chunked as one run of text.
   */
  getSections?(): EmbeddingSection[] | null;

  /** Get the source type identifier */
  getSourceType(): EmbeddingSourceType;

  /** Get the unique source ID */
  getSourceId(): string;

  /** Get the owner user ID */
  getUserId(): string | null;

  /** Get the associated project ID (optional) */
  getProjectId(): string | null;

  /**
   * Get the workspace ID this source belongs to (the security/scoping boundary).
   * Returning null is allowed for legacy entities that predate workspace scoping;
   * KnowledgeService logs a warning and falls back to writing chunks without
   * workspaceId so behaviour matches the pre-fix code path. New sources should
   * always return a real workspace id.
   */
  getWorkspaceId(): string | null;

  /** Get additional metadata for the source */
  getMetadata(): Record<string, unknown>;
}

/**
 * Result of an embedding operation
 */
export interface EmbeddingResult {
  success: boolean;
  chunkCount: number;
  error?: string;
  processingTimeMs?: number;
}

/**
 * Options for the embedding process
 */
export interface EmbeddingOptions {
  /** Use batch embedding for better performance (default: true) */
  useBatchEmbedding?: boolean;

  /** Maximum tokens per chunk (default: 500) */
  maxTokensPerChunk?: number;

  /** Token overlap between chunks (default: 50) */
  chunkOverlap?: number;

  /** Force re-embedding even if chunks exist (default: false) */
  force?: boolean;
}
