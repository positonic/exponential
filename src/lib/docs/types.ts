import type { ElementType } from "react";

export interface DocNavItem {
  title: string;
  href?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: ElementType<any>;
  children?: DocNavItem[];
}

export interface DocNavSection {
  title: string;
  items: DocNavItem[];
}

export interface DocMeta {
  title: string;
  description?: string;
  icon?: string;
  order?: number;
}

export interface DocContent {
  meta: DocMeta;
  content: string;
  headings: Heading[];
  slug: string[];
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface DocBreadcrumb {
  title: string;
  href?: string;
}
