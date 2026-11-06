import type { PrismaClient } from "@prisma/client";
import { enrichYouTubeResource, type EnrichOptions } from "./enrichYouTubeResource";
import { youtubeVideoId } from "~/utils/youtube";

/**
 * The retry path for YouTube saves whose after-response summary didn't land
 * (a slow source, a transient vendor error, a video longer than the 50 s
 * budget). Bounded on purpose, with no attempt counter in the schema:
 *
 * - only rows saved in the last RETRY_WINDOW, so a video no source can ever
 *   summarise (private, removed) is retried a handful of times and then left;
 * - not rows saved in the last few minutes, which the after-response hook is
 *   still working on;
 * - at most BATCH_SIZE per run, inside the route's time limit.
 *
 * Re-saving the link is the manual retry: it runs the hook again.
 */
const RETRY_WINDOW_MS = 2 * 60 * 60 * 1000;
const SETTLE_MS = 3 * 60 * 1000;
const BATCH_SIZE = 10;
const PER_VIDEO_BUDGET_MS = 60_000;
/** Stop starting new videos with this much of the 300 s route limit left. */
const SWEEP_BUDGET_MS = 220_000;

export interface SweepResult {
  candidates: number;
  summarized: number;
  failed: number;
}

export async function runYouTubeSummarySweep(
  db: PrismaClient,
  options: Pick<EnrichOptions, "deps"> & { now?: Date } = {},
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const started = Date.now();

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

  const result: SweepResult = { candidates: candidates.length, summarized: 0, failed: 0 };
  for (const row of candidates) {
    if (Date.now() - started > SWEEP_BUDGET_MS) break;
    const outcome = await enrichYouTubeResource(db, row.id, {
      deps: options.deps,
      budgetMs: PER_VIDEO_BUDGET_MS,
    });
    if (outcome.status === "summarized") result.summarized += 1;
    if (outcome.status === "failed") result.failed += 1;
  }
  return result;
}
