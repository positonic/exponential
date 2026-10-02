import { db } from "~/server/db";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildUpdatesFeed } from "~/server/services/workspaceUpdates/feed";
import { renderUpdateHtml } from "~/server/services/workspaceUpdates/html";
import { listPublicUpdates } from "~/server/services/workspaceUpdates/public";

/** RSS for a workspace's public updates; 404 unless it opted in. */
export async function GET(_request: Request, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const result = await listPublicUpdates(db, workspaceSlug);
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
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
