/**
 * Embedding types and interfaces for the knowledge base system.
 * Designed to be extensible for future source types.
 */

/**
 * Source types that can be embedded into the knowledge base.
 * Extensible for future sources like notes, Slack messages, documents, etc.
 */
export type EmbeddingSourceType = "transcription" | "resource";

/**
 * Status of the embedding process for a source.
 */
export type EmbeddingStatus =
  | "none"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/**
 * Interface for any source that can be embedded.
 * Implement this for new source types to enable automatic embedding.
 */
export interface EmbeddingSource {
  /** Get the text content to embed */
  getContent(): string | null;

  /** Get the source type identifier */
  getSourceType(): EmbeddingSourceType;

  /** Get the unique source ID */
  getSourceId(): string;

  /** Get the owner user ID */
  getUserId(): string | null;

  /** Get the associated project ID (optional) */
  getProjectId(): string | null;

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
