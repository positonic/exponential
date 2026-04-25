import "server-only";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type { DocContent } from "./types";
import { extractHeadings } from "./extractHeadings";

const DOCS_PATH = path.join(process.cwd(), "content/docs");

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
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function getAllDocSlugs(): Promise<string[][]> {
  const slugs: string[][] = [];

  async function walkDir(dir: string, prefix: string[] = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await walkDir(path.join(dir, entry.name), [...prefix, entry.name]);
        } else if (entry.name.endsWith(".md")) {
          const name = entry.name.replace(/\.md$/, "");
          if (name === "index") {
            // Only push non-empty prefixes (root /docs handled by separate page.tsx)
            if (prefix.length > 0) {
              slugs.push(prefix);
            }
          } else {
            slugs.push([...prefix, name]);
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  await walkDir(DOCS_PATH);
  return slugs;
}
