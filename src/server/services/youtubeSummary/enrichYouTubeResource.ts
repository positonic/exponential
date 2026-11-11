import type { PrismaClient } from "@prisma/client";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import {
  canonicalWatchUrl,
  defaultYouTubeSummaryDeps,
  fetchVideoMeta,
  isYouTubeSummaryConfigured,
  writeVideoArticle,
  type YouTubeSummaryDeps,
} from "./youtubeSummary";
import { ARTICLE_MIME_TYPE, isVideoArticle } from "~/lib/resources/reader";
import { youtubeVideoId } from "~/utils/youtube";

/**
 * One job has five minutes (`maxDuration` on its route). Leave room for
 * embedding and the DB writes; the cron sweep retries what doesn't finish.
 */
export const ARTICLE_BUDGET_MS = 240_000;

export type EnrichOutcome =
  | { status: "skipped"; reason: "not_found" | "not_youtube" | "already_written" | "not_configured" }
  | { status: "written"; source: "supadata" | "gemini" }
  | { status: "failed" };

export interface EnrichOptions {
  deps?: YouTubeSummaryDeps;
  budgetMs?: number;
}

function wordCount(text: string): number | null {
  const n = text.split(/\s+/).filter(Boolean).length;
  return n > 0 ? n : null;
}

/**
 * A title the save didn't really choose: the web "Save link" box stores the
 * hostname, and a browser tab title ends in " - YouTube". The video's own
 * title replaces those; anything the person typed is kept.
 */
export function isPlaceholderTitle(title: string, url: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed === url.trim()) return true;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // An unparseable URL has no hostname to compare against.
  }
  const lower = trimmed.toLowerCase();
  return lower === host || lower === `www.${host}` || lower === "youtube" || lower.endsWith(" - youtube");
}

/**
 * Rows the job may still write to: anything but a finished video article. As
 * `OR`s, because `NOT` on a nullable column would skip rows with a null mimeType.
 */
const NOT_YET_AN_ARTICLE = {
  OR: [{ contentType: { not: "video" } }, { mimeType: null }, { mimeType: { not: ARTICLE_MIME_TYPE } }],
};

/**
 * Give a saved YouTube link its real title and an article to read, keep the
 * transcript as the source, and index the article so the video is searchable.
 * Unlike other saves, this always indexes: a video is saved to be remembered
 * (decision 2026-11-07, amends D-0026 for videos).
 *
 * Idempotent: a finished article is left alone, and the write is conditional
 * on there still not being one, so overlapping jobs can't both write. A failure
 * changes nothing but the title, so a video summarised the old way keeps what it
 * has until an article exists. Never throws: nobody is waiting for an error.
 */
export async function enrichYouTubeResource(
  db: PrismaClient,
  resourceId: string,
  options: EnrichOptions = {},
): Promise<EnrichOutcome> {
  try {
    const deps = options.deps ?? defaultYouTubeSummaryDeps();
    if (!isYouTubeSummaryConfigured(deps)) return { status: "skipped", reason: "not_configured" };

    const resource = await db.resource.findUnique({
      where: { id: resourceId },
      select: {
        id: true,
        url: true,
        title: true,
        author: true,
        content: true,
        contentType: true,
        mimeType: true,
      },
    });
    if (!resource) return { status: "skipped", reason: "not_found" };
    if (isVideoArticle(resource)) return { status: "skipped", reason: "already_written" };
    const videoId = youtubeVideoId(resource.url);
    if (!videoId || !resource.url) return { status: "skipped", reason: "not_youtube" };

    const deadline = Date.now() + (options.budgetMs ?? ARTICLE_BUDGET_MS);
    const watchUrl = canonicalWatchUrl(videoId);
    const meta = await fetchVideoMeta(watchUrl, deps);
    const title =
      meta?.title && isPlaceholderTitle(resource.title, resource.url) ? meta.title : resource.title;
    const author = resource.author ?? meta?.author ?? null;

    const result = await writeVideoArticle(watchUrl, title, deps, deadline);

    if (!result) {
      // No article this time, but the real title is still worth keeping.
      if (title !== resource.title || author !== resource.author) {
        await db.resource.updateMany({
          where: { id: resource.id, ...NOT_YET_AN_ARTICLE },
          data: { title, author },
        });
      }
      return { status: "failed" };
    }

    // Gemini returns no transcript. A video summarised the old way has its
    // transcript in `content`, which the article is about to replace, so move it.
    // Anything else in `rawContent` is a scrape of the watch page, which the
    // reader would otherwise offer as the transcript, so it's cleared.
    const transcript = result.transcript ?? (resource.contentType === "video" ? resource.content : null);

    const { count } = await db.resource.updateMany({
      where: { id: resource.id, ...NOT_YET_AN_ARTICLE },
      data: {
        title,
        author,
        summary: result.standfirst,
        content: result.article,
        mimeType: ARTICLE_MIME_TYPE,
        contentType: "video",
        wordCount: wordCount(result.article),
        fetchedAt: new Date(),
        rawContent: transcript,
      },
    });
    if (count === 0) return { status: "skipped", reason: "already_written" };

    try {
      await getKnowledgeService(db).embedResource(resource.id);
    } catch (error) {
      console.error(`[youtubeSummary] Failed to embed resource ${resource.id}:`, error);
    }

    return { status: "written", source: result.source };
  } catch (error) {
    console.error(`[youtubeSummary] Enriching resource ${resourceId} failed:`, error);
    return { status: "failed" };
  }
}
