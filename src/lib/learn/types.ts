import type { Heading } from "~/lib/docs/types";

export interface LearnArticleMeta {
  title: string;
  description?: string;
  date: string;
  author?: string;
  tags?: string[];
  coverImage?: string;
  /** The content cluster this article belongs to */
  cluster?: string;
  /** Whether this is the pillar (hub) article for its cluster */
  isPillar?: boolean;
  /** Display order within the cluster (lower = first) */
  order?: number;
}

export interface LearnArticle {
  meta: LearnArticleMeta;
  content: string;
  headings: Heading[];
  slug: string;
}
