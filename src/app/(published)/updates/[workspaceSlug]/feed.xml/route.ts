import { db } from "~/server/db";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildUpdatesFeed } from "~/server/services/workspaceUpdates/feed";
import { renderUpdateHtml } from "~/server/services/workspaceUpdates/html";
import { FEED_ITEM_LIMIT, listPublicUpdates } from "~/server/services/workspaceUpdates/public";

/** RSS for a workspace's newest public updates; 404 unless it opted in. */
export async function GET(_request: Request, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const result = await listPublicUpdates(db, workspaceSlug, { pageSize: FEED_ITEM_LIMIT });
  if (!result) return new Response("Not found", { status: 404 });

  const rss = buildUpdatesFeed({
    workspace: result.workspace,
    updates: result.updates,
    baseUrl: getPublicBaseUrlFromEnv(),
    renderHtml: renderUpdateHtml,
    now: new Date(),
  });
  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Not cached by shared caches: turning the public page off must stop the
      // feed at once, not after a CDN copy expires.
      "Cache-Control": "no-store",
    },
  });
}
