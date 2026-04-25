import "server-only";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import type { BlogPost } from "./types";
import { extractHeadings } from "~/lib/docs/extractHeadings";

const BLOG_PATH = path.join(process.cwd(), "content/blog");

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const filePath = path.join(BLOG_PATH, `${slug}.md`);

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
      },
      content,
      headings,
      slug,
    };
  } catch {
    return null;
  }
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const posts: BlogPost[] = [];

  try {
    const entries = await fs.readdir(BLOG_PATH, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const slug = entry.name.replace(/\.md$/, "");
        const post = await getBlogPost(slug);
        if (post) {
          posts.push(post);
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  // Sort by date descending
  posts.sort(
    (a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime()
  );

  return posts;
}

export async function getAllBlogSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(BLOG_PATH, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}
