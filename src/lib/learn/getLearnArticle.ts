import "server-only";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type { LearnArticle } from "./types";
import { extractHeadings } from "~/lib/docs/extractHeadings";

const LEARN_PATH = path.join(process.cwd(), "content/learn");

export async function getLearnArticle(
  slug: string,
): Promise<LearnArticle | null> {
  const filePath = path.join(LEARN_PATH, `${slug}.md`);

  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const { data, content } = matter(fileContent);
    const headings = extractHeadings(content);

    return {
      meta: {
        title: (data.title as string) ?? "Untitled",
        description: data.description as string | undefined,
        date: (data.date as string) ?? new Date().toISOString(),
        author: data.author as string | undefined,
        tags: data.tags as string[] | undefined,
        coverImage: data.coverImage as string | undefined,
        cluster: data.cluster as string | undefined,
        isPillar: data.isPillar as boolean | undefined,
        order: data.order as number | undefined,
      },
      content,
      headings,
      slug,
    };
  } catch {
    return null;
  }
}

export async function getAllLearnArticles(): Promise<LearnArticle[]> {
  const articles: LearnArticle[] = [];

  try {
    const entries = await fs.readdir(LEARN_PATH, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const slug = entry.name.replace(/\.md$/, "");
        const article = await getLearnArticle(slug);
        if (article) {
          articles.push(article);
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  // Sort: pillars first, then by order, then by date descending
  articles.sort((a, b) => {
    if (a.meta.isPillar && !b.meta.isPillar) return -1;
    if (!a.meta.isPillar && b.meta.isPillar) return 1;
    if (a.meta.order != null && b.meta.order != null)
      return a.meta.order - b.meta.order;
    return new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime();
  });

  return articles;
}

export async function getAllLearnSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(LEARN_PATH, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

/** Get all articles in a specific cluster, with the pillar first */
export async function getClusterArticles(
  cluster: string,
): Promise<LearnArticle[]> {
  const all = await getAllLearnArticles();
  return all.filter((a) => a.meta.cluster === cluster);
}

/** Get unique cluster names from all articles */
export async function getAllClusters(): Promise<string[]> {
  const all = await getAllLearnArticles();
  const clusters = new Set<string>();
  for (const article of all) {
    if (article.meta.cluster) {
      clusters.add(article.meta.cluster);
    }
  }
  return Array.from(clusters);
}
