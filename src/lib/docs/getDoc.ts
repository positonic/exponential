import "server-only";
import { cache } from "react";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type { DocContent, DocNavSection, DocSearchEntry } from "./types";
import { extractHeadings } from "./extractHeadings";
import { buildDocsNavigation, buildDocsSearchIndex, DOCS_DIR, listDocPages } from "./content";
import { getLastUpdated, readLastUpdatedMap } from "./lastUpdated";

const DOCS_PATH = DOCS_DIR;

export async function getDocContent(
  slug: string[]
): Promise<DocContent | null> {
  const slugPath = slug.join("/");

  // Try different file paths
  const possiblePaths = [
    path.join(DOCS_PATH, `${slugPath}.md`),
    path.join(DOCS_PATH, slugPath, "index.md"),
  ];

  // Special case for root /docs
  if (slug.length === 0 || (slug.length === 1 && slug[0] === "")) {
    possiblePaths.unshift(path.join(DOCS_PATH, "index.md"));
  }

  for (const filePath of possiblePaths) {
    // The slug comes straight from the URL and this route is public, so never
    // read outside the docs directory. Next.js normalises `..` out of the path
    // before it reaches here, but that is the router's behaviour rather than a
    // guarantee this function makes, and the whole repo — dev-docs, CONTEXT.md,
    // ADRs — sits a couple of levels up from `content/docs`.
    //
    // Compare structurally rather than by string prefix, so the check holds
    // however DOCS_PATH comes to be declared — relative, or with a trailing
    // separator, either of which would make a `startsWith` test reject every
    // candidate and 404 the whole docs section.
    const relativeToDocs = path.relative(path.resolve(DOCS_PATH), path.resolve(filePath));
    if (relativeToDocs.startsWith("..") || path.isAbsolute(relativeToDocs)) continue;
    // `_meta.json`, `_last-updated.json` and `_drafts/` are not pages.
    if (path.basename(filePath).startsWith("_") || relativeToDocs.split(path.sep).some((s) => s.startsWith("_"))) continue;

    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const { data, content } = matter(fileContent);
      const headings = extractHeadings(content);

      return {
        meta: {
          title: (data.title as string) ?? "Documentation",
          description: data.description as string | undefined,
          icon: data.icon as string | undefined,
          order: data.order as number | undefined,
        },
        content,
        headings,
        slug,
        filePath: path.relative(process.cwd(), filePath),
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function getAllDocSlugs(): Promise<string[][]> {
  return listDocPages()
    .map((p) => p.slug)
    .filter((slug) => slug.length > 0);
}

/** Sidebar derived from frontmatter; memoised per request/render. */
export const getDocsNavigation = cache((): DocNavSection[] => buildDocsNavigation(listDocPages()));

/** Client-side search index; memoised per request/render. */
export const getDocsSearchIndex = cache((): DocSearchEntry[] => {
  const pages = listDocPages();
  return buildDocsSearchIndex(pages, buildDocsNavigation(pages));
});

/** ISO date of the last change to a page, or null when unknown. */
export const getDocLastUpdated = cache((filePath: string): string | null =>
  getLastUpdated(filePath, readLastUpdatedMap()),
);
