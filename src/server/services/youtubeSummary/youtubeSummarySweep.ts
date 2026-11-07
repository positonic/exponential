import type { PrismaClient } from "@prisma/client";
import { triggerVideoArticle } from "./triggerVideoArticle";
import { youtubeVideoId } from "~/utils/youtube";

/**
 * The retry path for YouTube saves whose article didn't land (a transient
 * vendor error, a lost kick, a video too long for one job). Bounded on purpose,
 * with no attempt counter in the schema, because a failed attempt can cost real
 * money:
 *
 * - only rows saved in the last RETRY_WINDOW, so a video no source can ever
 *   write up (private, removed) is retried a few times and then left;
 * - not rows saved in the last SETTLE, because the first job can still be
 *   running for that long, and a second would pay for the same article;
 * - at most BATCH_SIZE per run, each in its own function.
 *
 * Re-saving the link is the manual retry, and the way to give a video summarised
 * the old way an article.
 */
const RETRY_WINDOW_MS = 60 * 60 * 1000;
const SETTLE_MS = 6 * 60 * 1000;
const BATCH_SIZE = 5;

export interface SweepResult {
  candidates: number;
}

export async function runYouTubeSummarySweep(
  db: PrismaClient,
  options: { now?: Date; trigger?: (resourceId: string) => Promise<void> } = {},
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const trigger = options.trigger ?? triggerVideoArticle;

  const rows = await db.resource.findMany({
    where: {
      summary: null,
      archivedAt: null,
      createdAt: {
        gte: new Date(now.getTime() - RETRY_WINDOW_MS),
        lte: new Date(now.getTime() - SETTLE_MS),
      },
      OR: [{ url: { contains: "youtube.com" } }, { url: { contains: "youtu.be" } }],
    },
    select: { id: true, url: true },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  const candidates = rows.filter((row) => youtubeVideoId(row.url));

  await Promise.all(candidates.map((row) => trigger(row.id)));
  return { candidates: candidates.length };
}
