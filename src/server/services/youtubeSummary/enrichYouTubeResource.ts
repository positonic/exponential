import type { PrismaClient } from "@prisma/client";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import {
  canonicalWatchUrl,
  defaultYouTubeSummaryDeps,
  fetchVideoMeta,
  isYouTubeSummaryConfigured,
  summarizeYouTubeVideo,
  type YouTubeSummaryDeps,
} from "./youtubeSummary";
import { youtubeVideoId } from "~/utils/youtube";

/**
 * After a request returns, the function has until the route's `maxDuration`
 * (60 s on tRPC). Leave room for the DB writes; a video that needs longer is
 * picked up by the cron sweep, which has five minutes.
 */
export const AFTER_RESPONSE_BUDGET_MS = 50_000;

export type EnrichOutcome =
  | { status: "skipped"; reason: "not_found" | "not_youtube" | "already_summarized" | "not_configured" }
  | { status: "summarized"; source: "supadata" | "gemini" }
  | { status: "failed" };

export interface EnrichOptions {
  deps?: YouTubeSummaryDeps;
  budgetMs?: number;
  /**
   * Index the transcript into the Knowledge index. Only when the save asked
   * for it: capturing a body never implies embedding it (D-0026).
   */
  embed?: boolean;
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
 * Give a saved YouTube link its real title, a summary and (when captions
 * exist) the transcript as its body. Idempotent: a Resource that already has
 * a summary is left alone, and the write is conditional on `summary` still
 * being null, so the after-response hook and the cron sweep can race safely.
 * Never throws: it runs where nobody is waiting for an error.
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
      select: { id: true, url: true, title: true, author: true, summary: true },
    });
    if (!resource) return { status: "skipped", reason: "not_found" };
    if (resource.summary) return { status: "skipped", reason: "already_summarized" };
    const videoId = youtubeVideoId(resource.url);
    if (!videoId || !resource.url) return { status: "skipped", reason: "not_youtube" };

    const deadline = Date.now() + (options.budgetMs ?? AFTER_RESPONSE_BUDGET_MS);
    const watchUrl = canonicalWatchUrl(videoId);
    const meta = await fetchVideoMeta(watchUrl, deps);
    const title =
      meta?.title && isPlaceholderTitle(resource.title, resource.url) ? meta.title : resource.title;
    const author = resource.author ?? meta?.author ?? null;

    const result = await summarizeYouTubeVideo(watchUrl, title, deps, deadline);

    if (!result) {
      // No summary this time, but the real title is still worth keeping.
      if (title !== resource.title || author !== resource.author) {
        await db.resource.updateMany({
          where: { id: resource.id, summary: null },
          data: { title, author },
        });
      }
      return { status: "failed" };
    }

    const { count } = await db.resource.updateMany({
      where: { id: resource.id, summary: null },
      data: {
        title,
        author,
        summary: result.summary,
        contentType: "video",
        ...(result.transcript && {
          content: result.transcript,
          wordCount: wordCount(result.transcript),
          fetchedAt: new Date(),
        }),
      },
    });
    if (count === 0) return { status: "skipped", reason: "already_summarized" };

    if (options.embed && result.transcript) {
      try {
        await getKnowledgeService(db).embedResource(resource.id);
      } catch (error) {
        console.error(`[youtubeSummary] Failed to embed resource ${resource.id}:`, error);
      }
    }

    return { status: "summarized", source: result.source };
  } catch (error) {
    console.error(`[youtubeSummary] Enriching resource ${resourceId} failed:`, error);
    return { status: "failed" };
  }
}
