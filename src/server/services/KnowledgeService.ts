import { OpenAIEmbeddings } from "@langchain/openai";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import type {
  EmbeddingSource,
  EmbeddingResult,
  EmbeddingOptions,
  EmbeddingSourceType,
} from "./embedding/types";

const DEFAULT_CHUNK_SIZE = 500; // tokens
const DEFAULT_CHUNK_OVERLAP = 50; // tokens
const APPROX_CHARS_PER_TOKEN = 4;
const BATCH_SIZE = 20; // Embed 20 chunks at a time for efficiency

interface Chunk {
  text: string;
  index: number;
  startPos: number;
  endPos: number;
  tokenCount: number;
}

interface SearchResult {
  id: string;
  content: string;
  sourceType: "transcription" | "resource";
  sourceId: string;
  chunkIndex: number;
  similarity: number;
  sourceTitle?: string;
  sourceMeta?: {
    meetingDate?: Date;
    url?: string;
    contentType?: string;
  };
}

/**
 * Service for managing the knowledge base - chunking, embedding, and searching content.
 * Uses pgvector for efficient semantic search.
 */
export class KnowledgeService {
  private embeddings: OpenAIEmbeddings;
  private db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small",
    });
  }

  /**
   * Generate embedding vector for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embedding = await this.embeddings.embedQuery(text);
      return embedding;
    } catch (error) {
      console.error("[KnowledgeService] Failed to generate embedding:", error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch (more efficient than N+1)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      // LangChain's embedDocuments handles batching internally
      const embeddings = await this.embeddings.embedDocuments(texts);
      return embeddings;
    } catch (error) {
      console.error("[KnowledgeService] Batch embedding failed:", error);
      throw error;
    }
  }

  /**
   * Generic method to embed any source that implements EmbeddingSource.
   * Eliminates duplication between embedTranscription() and embedResource().
   */
  async embedSource(
    source: EmbeddingSource,
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const {
      useBatchEmbedding = true,
      maxTokensPerChunk = DEFAULT_CHUNK_SIZE,
      chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    } = options;

    const sourceType = source.getSourceType();
    const sourceId = source.getSourceId();
    const userId = source.getUserId();
    const projectId = source.getProjectId();
    const content = source.getContent();

    if (!content) {
      console.warn(
        `[KnowledgeService] Source ${sourceType}:${sourceId} has no content`
      );
      return { success: true, chunkCount: 0 };
    }

    if (!userId) {
      console.warn(
        `[KnowledgeService] Source ${sourceType}:${sourceId} has no userId`
      );
      return { success: false, chunkCount: 0, error: "No userId" };
    }

    try {
      // Chunk the content before starting transaction
      const chunks = this.chunkText(content, maxTokensPerChunk, chunkOverlap);

      if (chunks.length === 0) {
        return { success: true, chunkCount: 0 };
      }

      // Wrap delete + insert in a transaction for atomicity
      // If embedding fails, the deletion is rolled back to prevent data loss
      await this.db.$transaction(async (tx) => {
        // Delete existing chunks within transaction
        await this.deleteChunks(sourceType, sourceId, tx);

        if (useBatchEmbedding) {
          // Process in batches for efficiency
          await this.embedChunksBatch(
            chunks,
            sourceType,
            sourceId,
            userId,
            projectId,
            tx
          );
        } else {
          // Sequential embedding (fallback)
          await this.embedChunksSequential(
            chunks,
            sourceType,
            sourceId,
            userId,
            projectId,
            tx
          );
        }
      });

      const processingTimeMs = Date.now() - startTime;
      console.log(
        `[KnowledgeService] Embedded ${sourceType} ${sourceId}: ${chunks.length} chunks in ${processingTimeMs}ms`
      );

      return {
        success: true,
        chunkCount: chunks.length,
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[KnowledgeService] Failed to embed ${sourceType}:${sourceId}:`,
        error
      );
      return {
        success: false,
        chunkCount: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Batch embed chunks for better performance
   */
  private async embedChunksBatch(
    chunks: Chunk[],
    sourceType: EmbeddingSourceType,
    sourceId: string,
    userId: string,
    projectId: string | null,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.db;

    // Process in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const texts = batchChunks.map((c) => c.text);

      // Get embeddings for entire batch in one API call
      const embeddings = await this.generateBatchEmbeddings(texts);

      // Store all chunks in batch
      for (let j = 0; j < batchChunks.length; j++) {
        const chunk = batchChunks[j];
        const embedding = embeddings[j];

        if (!chunk || !embedding) {
          throw new Error(
            `Batch embedding alignment error at index ${j}: ` +
              `batchChunks has ${batchChunks.length} items, ` +
              `generateBatchEmbeddings returned ${embeddings.length} embeddings`
          );
        }

        const embeddingStr = `[${embedding.join(",")}]`;

        await client.$executeRaw`
          INSERT INTO "KnowledgeChunk" (
            id, content, embedding, "sourceType", "sourceId",
            "chunkIndex", "tokenCount", "startPos", "endPos",
            "userId", "projectId", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${chunk.text}, ${embeddingStr}::vector,
            ${sourceType}, ${sourceId},
            ${chunk.index}, ${chunk.tokenCount}, ${chunk.startPos}, ${chunk.endPos},
            ${userId}, ${projectId}, NOW()
          )
        `;
      }
    }
  }

  /**
   * Sequential embedding (N+1 pattern, for fallback)
   */
  private async embedChunksSequential(
    chunks: Chunk[],
    sourceType: EmbeddingSourceType,
    sourceId: string,
    userId: string,
    projectId: string | null,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.db;

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.text);
      const embeddingStr = `[${embedding.join(",")}]`;

      await client.$executeRaw`
        INSERT INTO "KnowledgeChunk" (
          id, content, embedding, "sourceType", "sourceId",
          "chunkIndex", "tokenCount", "startPos", "endPos",
          "userId", "projectId", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${chunk.text}, ${embeddingStr}::vector,
          ${sourceType}, ${sourceId},
          ${chunk.index}, ${chunk.tokenCount}, ${chunk.startPos}, ${chunk.endPos},
          ${userId}, ${projectId}, NOW()
        )
      `;
    }
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
  }

  /**
   * Split text into sentences
   */
  splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries while preserving the delimiter
    const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  /**
   * Chunk text into ~500 token segments with sentence boundary awareness
   */
  chunkText(
    text: string,
    maxTokens: number = DEFAULT_CHUNK_SIZE,
    overlapTokens: number = DEFAULT_CHUNK_OVERLAP
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const sentences = this.splitIntoSentences(text);

    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkStartPos = 0;
    let currentPos = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      // If single sentence exceeds max, split it by words
      if (sentenceTokens > maxTokens) {
        // Flush current chunk first
        if (currentChunk.length > 0) {
          const chunkText = currentChunk.join(" ");
          chunks.push({
            text: chunkText,
            index: chunks.length,
            startPos: chunkStartPos,
            endPos: currentPos,
            tokenCount: this.estimateTokens(chunkText),
          });
          currentChunk = [];
          currentTokens = 0;
        }

        // Split long sentence by character limit
        const words = sentence.split(/\s+/);
        let wordChunk: string[] = [];
        let wordTokens = 0;

        for (const word of words) {
          const wordTokenCount = this.estimateTokens(word + " ");
          if (wordTokens + wordTokenCount > maxTokens && wordChunk.length > 0) {
            const chunkText = wordChunk.join(" ");
            chunks.push({
              text: chunkText,
              index: chunks.length,
              startPos: chunkStartPos,
              endPos: currentPos + chunkText.length,
              tokenCount: this.estimateTokens(chunkText),
            });
            chunkStartPos = currentPos + chunkText.length;
            wordChunk = [];
            wordTokens = 0;
          }
          wordChunk.push(word);
          wordTokens += wordTokenCount;
        }

        if (wordChunk.length > 0) {
          currentChunk = wordChunk;
          currentTokens = wordTokens;
        }
      } else if (currentTokens + sentenceTokens > maxTokens) {
        // Current chunk is full, save it
        const chunkText = currentChunk.join(" ");
        chunks.push({
          text: chunkText,
          index: chunks.length,
          startPos: chunkStartPos,
          endPos: currentPos,
          tokenCount: this.estimateTokens(chunkText),
        });

        // Start new chunk with overlap (last few sentences)
        const overlapSentences: string[] = [];
        let overlapTokenCount = 0;
        for (let i = currentChunk.length - 1; i >= 0; i--) {
          const s = currentChunk[i]!;
          const tokens = this.estimateTokens(s);
          if (overlapTokenCount + tokens <= overlapTokens) {
            overlapSentences.unshift(s);
            overlapTokenCount += tokens;
          } else {
            break;
          }
        }

        chunkStartPos = currentPos - overlapSentences.join(" ").length;
        currentChunk = [...overlapSentences, sentence];
        currentTokens = overlapTokenCount + sentenceTokens;
      } else {
        // Add sentence to current chunk
        currentChunk.push(sentence);
        currentTokens += sentenceTokens;
      }

      currentPos += sentence.length + 1; // +1 for space
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(" ");
      chunks.push({
        text: chunkText,
        index: chunks.length,
        startPos: chunkStartPos,
        endPos: text.length,
        tokenCount: this.estimateTokens(chunkText),
      });
    }

    return chunks;
  }

  /**
   * Process and embed content from a Resource.
   * Delegates to embedSource() for the actual embedding work.
   */
  async embedResource(resourceId: string): Promise<number> {
    const resource = await this.db.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    const { ResourceSource } = await import("./embedding/sources/ResourceSource");
    const source = ResourceSource.fromEntity(resource);
    const result = await this.embedSource(source);

    if (!result.success && result.error) {
      throw new Error(result.error);
    }

    return result.chunkCount;
  }

  /**
   * Process and embed content from a TranscriptionSession.
   * Delegates to embedSource() for the actual embedding work.
   */
  async embedTranscription(transcriptionId: string): Promise<number> {
    const transcription = await this.db.transcriptionSession.findUnique({
      where: { id: transcriptionId },
    });

    if (!transcription) {
      throw new Error(`Transcription not found: ${transcriptionId}`);
    }

    const { TranscriptionSource } = await import(
      "./embedding/sources/TranscriptionSource"
    );
    const source = TranscriptionSource.fromEntity(transcription);
    const result = await this.embedSource(source);

    if (!result.success && result.error) {
      throw new Error(result.error);
    }

    return result.chunkCount;
  }

  /**
   * Search the knowledge base using semantic similarity
   */
  async search(
    query: string,
    options: {
      userId: string;
      projectId?: string;
      sourceTypes?: ("transcription" | "resource")[];
      limit?: number;
    }
  ): Promise<SearchResult[]> {
    const { userId, projectId, sourceTypes, limit = 10 } = options;

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Build parameterized query with conditional filters
    // Using Prisma.sql tagged template to prevent SQL injection
    const sourceTypeCondition =
      sourceTypes && sourceTypes.length > 0
        ? Prisma.sql`AND kc."sourceType" = ANY(${sourceTypes}::text[])`
        : Prisma.empty;

    const projectCondition = projectId
      ? Prisma.sql`AND (kc."projectId" = ${projectId} OR kc."projectId" IS NULL)`
      : Prisma.empty;

    // Execute vector search with parameterized query
    const results = await this.db.$queryRaw<
      Array<{
        id: string;
        content: string;
        sourceType: string;
        sourceId: string;
        chunkIndex: number;
        similarity: number;
        sourceTitle: string | null;
        meetingDate: Date | null;
        url: string | null;
        contentType: string | null;
      }>
    >`
      SELECT
        kc.id,
        kc.content,
        kc."sourceType",
        kc."sourceId",
        kc."chunkIndex",
        1 - (kc.embedding <=> ${embeddingStr}::vector) as similarity,
        CASE
          WHEN kc."sourceType" = 'transcription' THEN ts.title
          WHEN kc."sourceType" = 'resource' THEN r.title
        END as "sourceTitle",
        ts."meetingDate",
        r.url,
        r."contentType"
      FROM "KnowledgeChunk" kc
      LEFT JOIN "TranscriptionSession" ts
        ON kc."sourceType" = 'transcription' AND kc."sourceId" = ts.id
      LEFT JOIN "Resource" r
        ON kc."sourceType" = 'resource' AND kc."sourceId" = r.id
      WHERE kc."userId" = ${userId}
        ${projectCondition}
        ${sourceTypeCondition}
      ORDER BY kc.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      sourceType: r.sourceType as "transcription" | "resource",
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      similarity: r.similarity,
      sourceTitle: r.sourceTitle ?? undefined,
      sourceMeta: {
        meetingDate: r.meetingDate ?? undefined,
        url: r.url ?? undefined,
        contentType: r.contentType ?? undefined,
      },
    }));
  }

  /**
   * Delete all chunks for a source
   */
  async deleteChunks(
    sourceType: "transcription" | "resource",
    sourceId: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.db;
    await client.$executeRaw`
      DELETE FROM "KnowledgeChunk"
      WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}
    `;
  }

  /**
   * Get chunk count for a source
   */
  async getChunkCount(
    sourceType: "transcription" | "resource",
    sourceId: string
  ): Promise<number> {
    const result = await this.db.knowledgeChunk.count({
      where: { sourceType, sourceId },
    });
    return result;
  }
}

// Singleton instance factory
let knowledgeServiceInstance: KnowledgeService | null = null;

export function getKnowledgeService(db: PrismaClient): KnowledgeService {
  if (!knowledgeServiceInstance) {
    knowledgeServiceInstance = new KnowledgeService(db);
  }
  return knowledgeServiceInstance;
}
