/**
 * Reads `content/docs` and derives everything the docs site needs from it:
 * the page list, the sidebar, and the search index.
 *
 * Deliberately free of `server-only` so `scripts/check-docs.ts` (a plain
 * `tsx` script) can import it; the page renderer wraps these in
 * `getDoc.ts`, which is server-only.
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type {
  DocNavItem,
  DocNavSection,
  DocPage,
  DocPageMeta,
  DocSearchEntry,
  DocSectionMeta,
} from "./types";
import { extractHeadings } from "./extractHeadings";

export const DOCS_DIR = path.join(process.cwd(), "content/docs");
export const DOCS_BASE = "/docs";

interface RootMeta {
  sections?: DocSectionMeta[];
}

function readRootMeta(docsDir: string): RootMeta {
  const metaPath = path.join(docsDir, "_meta.json");
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as RootMeta;
  } catch {
    return {};
  }
}

function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toMeta(data: Record<string, unknown>): DocPageMeta {
  return {
    title: typeof data.title === "string" ? data.title : "Documentation",
    description: typeof data.description === "string" ? data.description : undefined,
    sidebarTitle: typeof data.sidebarTitle === "string" ? data.sidebarTitle : undefined,
    section: typeof data.section === "string" ? data.section : undefined,
    order: typeof data.order === "number" ? data.order : undefined,
    icon: typeof data.icon === "string" ? data.icon : undefined,
    parent: typeof data.parent === "string" ? data.parent : undefined,
    hidden: data.hidden === true,
  };
}

/**
 * Every Markdown page under `content/docs`, in filesystem order. Files and
 * folders whose name starts with `_` are ignored (`_meta.json`,
 * `_last-updated.json`, drafts).
 */
export function listDocPages(docsDir: string = DOCS_DIR): DocPage[] {
  const pages: DocPage[] = [];

  function walk(dir: string, prefix: string[]) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, [...prefix, entry.name]);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      const name = entry.name.replace(/\.md$/, "");
      const slug = name === "index" ? prefix : [...prefix, name];
      const raw = fs.readFileSync(full, "utf-8");
      let parsed: { data: Record<string, unknown>; content: string };
      try {
        parsed = matter(raw);
      } catch (error) {
        // A page with broken frontmatter must not take the whole docs site down;
        // scripts/check-docs.ts reports it and fails CI.
        console.error(`[docs] skipping ${full}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        continue;
      }
      const { data, content } = parsed;
      pages.push({
        slug,
        href: slug.length ? `${DOCS_BASE}/${slug.join("/")}` : DOCS_BASE,
        filePath: path.relative(process.cwd(), full),
        meta: toMeta(data),
        content,
      });
    }
  }

  walk(docsDir, []);
  return pages;
}

function sectionIdFor(page: DocPage, firstSectionId: string): string {
  if (page.meta.section) return page.meta.section;
  if (page.slug.length === 0) return firstSectionId;
  return page.slug[0]!;
}

function byOrderThenTitle(a: DocNavItem & { order?: number }, b: DocNavItem & { order?: number }) {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title);
}

/**
 * Builds the sidebar from page frontmatter plus the section list in
 * `content/docs/_meta.json`. Sections not listed there are appended in
 * first-seen order with a title-cased folder name, so a new folder still
 * shows up — it just won't be ordered until it is added to `_meta.json`.
 */
export function buildDocsNavigation(
  pages: DocPage[],
  docsDir: string = DOCS_DIR,
): DocNavSection[] {
  const rootMeta = readRootMeta(docsDir);
  const declared = rootMeta.sections ?? [];
  const firstSectionId = declared[0]?.id ?? "get-started";

  type Draft = DocNavItem & { order?: number; parent?: string; sectionId: string };
  const drafts: Draft[] = pages
    .filter((p) => !p.meta.hidden)
    .map((p) => ({
      title: p.meta.sidebarTitle ?? p.meta.title,
      href: p.href,
      icon: p.meta.icon,
      order: p.meta.order,
      parent: p.meta.parent,
      sectionId: sectionIdFor(p, firstSectionId),
    }));

  const byHref = new Map(drafts.map((d) => [d.href, d]));
  const children = new Map<string, Draft[]>();
  const topLevel: Draft[] = [];
  for (const d of drafts) {
    if (d.parent && byHref.has(d.parent) && d.parent !== d.href) {
      const list = children.get(d.parent) ?? [];
      list.push(d);
      children.set(d.parent, list);
    } else {
      topLevel.push(d);
    }
  }

  const sectionOrder: string[] = declared.map((s) => s.id);
  for (const d of topLevel) {
    if (!sectionOrder.includes(d.sectionId)) sectionOrder.push(d.sectionId);
  }

  const sections: DocNavSection[] = [];
  for (const id of sectionOrder) {
    const items = topLevel
      .filter((d) => d.sectionId === id)
      .sort(byOrderThenTitle)
      .map((d) => {
        const kids = (children.get(d.href) ?? []).sort(byOrderThenTitle);
        const item: DocNavItem = { title: d.title, href: d.href, icon: d.icon };
        if (kids.length) {
          item.children = kids.map((k) => ({ title: k.title, href: k.href, icon: k.icon }));
        }
        return item;
      });
    if (items.length === 0) continue;
    const title = declared.find((s) => s.id === id)?.title ?? titleCase(id);
    sections.push({ id, title, items });
  }
  return sections;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstParagraph(markdown: string): string {
  const blocks = markdown.split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^(#|!\[|```|\||<|-|\d+\.|\*)/.test(trimmed)) continue;
    return stripMarkdown(trimmed).slice(0, 240);
  }
  return "";
}

/**
 * One entry per visible page: title, description, section, H2/H3 headings
 * and the first paragraph. Searched client-side with fuse.js.
 */
export function buildDocsSearchIndex(pages: DocPage[], nav: DocNavSection[]): DocSearchEntry[] {
  const sectionByHref = new Map<string, string>();
  for (const section of nav) {
    for (const item of section.items) {
      sectionByHref.set(item.href, section.title);
      for (const child of item.children ?? []) sectionByHref.set(child.href, section.title);
    }
  }
  return pages
    .filter((p) => !p.meta.hidden)
    .map((p) => ({
      href: p.href,
      title: p.meta.title,
      description: p.meta.description ?? "",
      section: sectionByHref.get(p.href) ?? "",
      headings: extractHeadings(p.content).map((h) => h.text),
      excerpt: firstParagraph(p.content),
    }));
}

/** GitHub "edit this file" URL for a repo-relative docs path. */
export const DOCS_REPO_EDIT_BASE = "https://github.com/positonic/exponential/edit/main";

export function docsEditUrl(filePath: string): string {
  return `${DOCS_REPO_EDIT_BASE}/${filePath.split(path.sep).join("/")}`;
}
