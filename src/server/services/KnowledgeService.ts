import { OpenAIEmbeddings } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const DEFAULT_CHUNK_SIZE = 500; // tokens
const DEFAULT_CHUNK_OVERLAP = 50; // tokens
const APPROX_CHARS_PER_TOKEN = 4;

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
   * Process and embed content from a Resource
   */
  async embedResource(resourceId: string): Promise<number> {
    const resource = await this.db.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    const textToEmbed = resource.content ?? resource.rawContent;
    if (!textToEmbed) {
      console.warn(`[KnowledgeService] Resource ${resourceId} has no content`);
      return 0;
    }

    // Delete existing chunks for this resource
    await this.db.$executeRaw`
      DELETE FROM "KnowledgeChunk"
      WHERE "sourceType" = 'resource' AND "sourceId" = ${resourceId}
    `;

    // Chunk the content
    const chunks = this.chunkText(textToEmbed);

    // Generate embeddings and store
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.text);
      const embeddingStr = `[${embedding.join(",")}]`;

      await this.db.$executeRaw`
        INSERT INTO "KnowledgeChunk" (
          id, content, embedding, "sourceType", "sourceId",
          "chunkIndex", "tokenCount", "startPos", "endPos",
          "userId", "projectId", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${chunk.text}, ${embeddingStr}::vector,
          'resource', ${resourceId},
          ${chunk.index}, ${chunk.tokenCount}, ${chunk.startPos}, ${chunk.endPos},
          ${resource.userId}, ${resource.projectId}, NOW()
        )
      `;
    }

    console.log(
      `[KnowledgeService] Embedded resource ${resourceId}: ${chunks.length} chunks`
    );
    return chunks.length;
  }

  /**
   * Process and embed content from a TranscriptionSession
   */
  async embedTranscription(transcriptionId: string): Promise<number> {
    const transcription = await this.db.transcriptionSession.findUnique({
      where: { id: transcriptionId },
    });

    if (!transcription) {
      throw new Error(`Transcription not found: ${transcriptionId}`);
    }

    const textToEmbed = transcription.transcription;
    if (!textToEmbed) {
      console.warn(
        `[KnowledgeService] Transcription ${transcriptionId} has no content`
      );
      return 0;
    }

    // Delete existing chunks for this transcription
    await this.db.$executeRaw`
      DELETE FROM "KnowledgeChunk"
      WHERE "sourceType" = 'transcription' AND "sourceId" = ${transcriptionId}
    `;

    // Chunk the content
    const chunks = this.chunkText(textToEmbed);

    // Generate embeddings and store
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.text);
      const embeddingStr = `[${embedding.join(",")}]`;

      await this.db.$executeRaw`
        INSERT INTO "KnowledgeChunk" (
          id, content, embedding, "sourceType", "sourceId",
          "chunkIndex", "tokenCount", "startPos", "endPos",
          "userId", "projectId", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${chunk.text}, ${embeddingStr}::vector,
          'transcription', ${transcriptionId},
          ${chunk.index}, ${chunk.tokenCount}, ${chunk.startPos}, ${chunk.endPos},
          ${transcription.userId}, ${transcription.projectId}, NOW()
        )
      `;
    }

    console.log(
      `[KnowledgeService] Embedded transcription ${transcriptionId}: ${chunks.length} chunks`
    );
    return chunks.length;
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

    // Build source type filter
    const sourceTypeFilter =
      sourceTypes && sourceTypes.length > 0
        ? `AND kc."sourceType" IN (${sourceTypes.map((t) => `'${t}'`).join(",")})`
        : "";

    // Build project filter
    const projectFilter = projectId
      ? `AND (kc."projectId" = '${projectId}' OR kc."projectId" IS NULL)`
      : "";

    // Execute vector search
    const results = await this.db.$queryRawUnsafe<
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
    >(`
      SELECT
        kc.id,
        kc.content,
        kc."sourceType",
        kc."sourceId",
        kc."chunkIndex",
        1 - (kc.embedding <=> '${embeddingStr}'::vector) as similarity,
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
      WHERE kc."userId" = '${userId}'
        ${projectFilter}
        ${sourceTypeFilter}
      ORDER BY kc.embedding <=> '${embeddingStr}'::vector
      LIMIT ${limit}
    `);

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
    sourceId: string
  ): Promise<void> {
    await this.db.$executeRaw`
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
