import type { Resource } from "@prisma/client";
import { isVideoArticle } from "~/lib/resources/reader";
import type { EmbeddingSection, EmbeddingSource, EmbeddingSourceType } from "../types";

/**
 * An article's sections, each with its title and heading as context. Links keep
 * only their text, because a URL means nothing to a search. A `##` inside a code
 * fence isn't a heading.
 */
export function articleSections(title: string, article: string): EmbeddingSection[] {
  const sections: EmbeddingSection[] = [];
  let context = title;
  let lines: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = lines.join("\n").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
    if (text) sections.push({ context, text });
    lines = [];
  };

  for (const line of article.split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    const heading = inFence ? null : /^## +(.+)$/.exec(line)?.[1];
    if (heading) {
      flush();
      context = `${title} › ${heading}`;
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Adapter to wrap Resource entities for embedding.
 */
export class ResourceSource implements EmbeddingSource {
  constructor(private resource: Resource) {}

  getContent(): string | null {
    return this.resource.content ?? this.resource.rawContent;
  }

  getSections(): EmbeddingSection[] | null {
    return isVideoArticle(this.resource) && this.resource.content
      ? articleSections(this.resource.title, this.resource.content)
      : null;
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

  getWorkspaceId(): string | null {
    return this.resource.workspaceId;
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
