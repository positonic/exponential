import type { Heading } from "~/lib/docs/types";

export interface BlogMeta {
  title: string;
  description?: string;
  date: string;
  author?: string;
  tags?: string[];
  coverImage?: string;
}

export interface BlogPost {
  meta: BlogMeta;
  content: string;
  headings: Heading[];
  slug: string;
}
