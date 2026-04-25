import { OpenAIEmbeddings } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Service for generating and comparing text embeddings
 * Used for clustering similar feature requests and improvement suggestions
 */
export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;
  private db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small", // Fast and cost-effective
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
      console.error("[EmbeddingService] Failed to generate embedding:", error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Embedding vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find similar feature requests based on embedding similarity
   */
  async findSimilarFeatureRequests(
    embedding: number[],
    threshold: number = SIMILARITY_THRESHOLD
  ): Promise<
    Array<{
      id: string;
      title: string;
      similarity: number;
    }>
  > {
    // Get all feature requests with embeddings
    const featureRequests = await this.db.featureRequest.findMany({
      where: {
        status: { in: ["open", "planned"] },
        embedding: { isEmpty: false },
      },
      select: {
        id: true,
        title: true,
        embedding: true,
      },
    });

    // Calculate similarity for each
    const similarRequests = featureRequests
      .map((request) => ({
        id: request.id,
        title: request.title,
        similarity: this.cosineSimilarity(embedding, request.embedding),
      }))
      .filter((r) => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);

    return similarRequests;
  }

  /**
   * Process an improvement suggestion and either merge with existing
   * feature request or create a new one
   */
  async processImprovementSuggestion(
    suggestion: string,
    feedbackId: string,
    rating: number
  ): Promise<{ action: "merged" | "created"; featureRequestId: string }> {
    // Generate embedding for the suggestion
    const embedding = await this.generateEmbedding(suggestion);

    // Find similar existing feature requests
    const similarRequests = await this.findSimilarFeatureRequests(embedding);

    if (similarRequests.length > 0 && similarRequests[0]) {
      // Merge with the most similar existing request
      const targetRequest = similarRequests[0];

      const existingRequest = await this.db.featureRequest.findUnique({
        where: { id: targetRequest.id },
      });

      if (existingRequest) {
        // Update the existing feature request
        const newFeedbackCount = existingRequest.feedbackCount + 1;
        const newAvgRating = existingRequest.avgRating
          ? (existingRequest.avgRating * existingRequest.feedbackCount +
              rating) /
            newFeedbackCount
          : rating;

        await this.db.featureRequest.update({
          where: { id: targetRequest.id },
          data: {
            feedbackIds: [...existingRequest.feedbackIds, feedbackId],
            feedbackCount: newFeedbackCount,
            avgRating: newAvgRating,
            // Boost priority for low ratings
            priority:
              rating <= 2
                ? existingRequest.priority + 50
                : existingRequest.priority + 10,
            description: `${existingRequest.description}\n\n---\n\nRelated feedback:\n${suggestion}`,
          },
        });

        console.log(
          `[EmbeddingService] Merged suggestion into existing request: ${targetRequest.id} (similarity: ${targetRequest.similarity.toFixed(3)})`
        );

        return { action: "merged", featureRequestId: targetRequest.id };
      }
    }

    // Create a new feature request
    const newRequest = await this.db.featureRequest.create({
      data: {
        title: suggestion.slice(0, 100),
        description: suggestion,
        embedding,
        priority: rating <= 2 ? 50 : 10,
        feedbackIds: [feedbackId],
        avgRating: rating,
      },
    });

    console.log(
      `[EmbeddingService] Created new feature request: ${newRequest.id}`
    );

    return { action: "created", featureRequestId: newRequest.id };
  }
}

// Singleton instance factory
let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(db: PrismaClient): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService(db);
  }
  return embeddingServiceInstance;
}
