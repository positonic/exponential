import type { KnowledgePage } from "@prisma/client";
import type { EmbeddingSource, EmbeddingSourceType } from "../types";

/**
 * Adapter to wrap KnowledgePage entities for embedding (ADR-0033). The Markdown
 * `body` projection is what gets indexed — the canonical `bodyDoc` ProseMirror
 * JSON is never embedded directly.
 */
export class PageSource implements EmbeddingSource {
  constructor(private page: KnowledgePage) {}

  getContent(): string | null {
    return this.page.body;
  }

  getSourceType(): EmbeddingSourceType {
    return "page";
  }

  getSourceId(): string {
    return this.page.id;
  }

  getUserId(): string | null {
    return this.page.createdById;
  }

  getProjectId(): string | null {
    return this.page.projectId;
  }

  getWorkspaceId(): string | null {
    return this.page.workspaceId;
  }

  getMetadata(): Record<string, unknown> {
    return {
      title: this.page.title,
      projectId: this.page.projectId,
    };
  }

  static fromEntity(page: KnowledgePage): PageSource {
    return new PageSource(page);
  }
}
