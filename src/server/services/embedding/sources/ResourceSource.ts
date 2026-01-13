import type { Resource } from "@prisma/client";
import type { EmbeddingSource, EmbeddingSourceType } from "../types";

/**
 * Adapter to wrap Resource entities for embedding.
 */
export class ResourceSource implements EmbeddingSource {
  constructor(private resource: Resource) {}

  getContent(): string | null {
    return this.resource.content ?? this.resource.rawContent;
  }

  getSourceType(): EmbeddingSourceType {
    return "resource";
  }

  getSourceId(): string {
    return this.resource.id;
  }

  getUserId(): string | null {
    return this.resource.userId;
  }

  getProjectId(): string | null {
    return this.resource.projectId;
  }

  getMetadata(): Record<string, unknown> {
    return {
      title: this.resource.title,
      url: this.resource.url,
      contentType: this.resource.contentType,
      author: this.resource.author,
      publishedAt: this.resource.publishedAt,
    };
  }

  static fromEntity(resource: Resource): ResourceSource {
    return new ResourceSource(resource);
  }
}
