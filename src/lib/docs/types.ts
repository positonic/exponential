/**
 * Frontmatter a docs page may carry. Everything but `title` is optional;
 * the sidebar is derived from these fields (see `content.ts`), so adding a
 * Markdown file with a `title` is enough to put it in the sidebar.
 */
export interface DocPageMeta {
  title: string;
  description?: string;
  /** Shorter label for the sidebar; defaults to `title`. */
  sidebarTitle?: string;
  /** Section id from `content/docs/_meta.json`; defaults to the top-level folder name. */
  section?: string;
  /** Sort key inside the section (or inside the parent). Unordered pages sort alphabetically after ordered ones. */
  order?: number;
  /** Tabler icon name, e.g. `IconBook`; see `icons.ts` for the supported set. */
  icon?: string;
  /** Href of the page this one nests under, e.g. `/docs/features/crm`. One level only. */
  parent?: string;
  /** Hide the page from the sidebar and search but keep the URL working. */
  hidden?: boolean;
  /** `YYYY-MM-DD` of the last change; stamped by the pre-commit hook (see `lastUpdated.ts`). */
  updated?: string;
}

export interface DocPage {
  /** URL segments after `/docs`, empty for the landing page. */
  slug: string[];
  href: string;
  /** Repo-relative path, e.g. `content/docs/features/crm.md`. */
  filePath: string;
  meta: DocPageMeta;
  /** Markdown body without frontmatter. */
  content: string;
}

export interface DocNavItem {
  title: string;
  href: string;
  icon?: string;
  children?: DocNavItem[];
}

export interface DocNavSection {
  id: string;
  title: string;
  items: DocNavItem[];
}

export interface DocSectionMeta {
  id: string;
  title: string;
}

export interface DocSearchEntry {
  href: string;
  title: string;
  description: string;
  section: string;
  headings: string[];
  excerpt: string;
}

/** @deprecated Use DocPageMeta. Kept for the page renderer's existing prop shape. */
export type DocMeta = Pick<DocPageMeta, "title" | "description" | "icon" | "order">;

export interface DocContent {
  meta: DocMeta;
  content: string;
  headings: Heading[];
  slug: string[];
  filePath: string;
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
