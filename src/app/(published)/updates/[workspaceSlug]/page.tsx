import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import {
  listPublicUpdates,
  parsePageParam,
  publicUpdatePath,
  publicUpdatesPath,
} from "~/server/services/workspaceUpdates/public";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { SubscribeForm } from "../_components/SubscribeForm";
import { UpdatesShell, formatPublishedDate } from "../_components/UpdatesShell";

/**
 * Rendered per request, never cached: turning the public page off must take
 * it down at once, and a cached copy would outlive the opt-out.
 */
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function pageHref(workspaceSlug: string, page: number): string {
  return page > 1 ? `${publicUpdatesPath(workspaceSlug)}?page=${page}` : publicUpdatesPath(workspaceSlug);
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const page = parsePageParam((await searchParams).page);
  const result = await listPublicUpdates(db, workspaceSlug, { page });
  if (!result) return { title: "Not found" };
  const baseUrl = await getPublicBaseUrl();
  const title = `${result.workspace.name} updates`;
  const description = `What ${result.workspace.name} shipped, week by week.`;
  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}${pageHref(workspaceSlug, page)}`,
      types: { "application/rss+xml": `${baseUrl}${publicUpdatesPath(workspaceSlug)}/feed.xml` },
    },
    openGraph: { title, description, type: "website", url: `${baseUrl}${publicUpdatesPath(workspaceSlug)}` },
  };
}

/**
 * A workspace's public updates: each approved Workspace update, newest first,
 * rendered from the snapshot frozen at approval and paged so older ones stay
 * reachable. 404 unless the workspace made its updates public.
 */
export default async function PublicUpdatesPage({ params, searchParams }: Params) {
  const { workspaceSlug } = await params;
  const page = parsePageParam((await searchParams).page);
  const result = await listPublicUpdates(db, workspaceSlug, { page });
  if (!result) notFound();
  const { workspace, updates, hasOlder } = result;
  if (page > 1 && updates.length === 0) notFound();

  return (
    <UpdatesShell
      workspaceName={workspace.name}
      indexHref={publicUpdatesPath(workspace.slug)}
      feedHref={`${publicUpdatesPath(workspace.slug)}/feed.xml`}
    >
      <h1 className="mb-2 text-3xl font-bold text-text-primary">What {workspace.name} shipped</h1>
      <p className="mb-8 text-sm text-text-muted">A short update every week, newest first.</p>
      {workspace.acceptsSignups && page === 1 && (
        <SubscribeForm workspaceSlug={workspace.slug} workspaceName={workspace.name} />
      )}
      {updates.length === 0 ? (
        <p className="text-text-muted">No updates yet.</p>
      ) : (
        <div className="space-y-12">
          {updates.map((update) => (
            <article key={update.id} className="border-b border-border-primary pb-10 last:border-b-0">
              <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">
                {formatPublishedDate(update.publishedAt)}
              </p>
              <h2 className="mb-4 text-2xl font-semibold text-text-primary">
                <Link href={publicUpdatePath(workspace.slug, update.id)} className="hover:underline">
                  {update.title}
                </Link>
              </h2>
              <MarkdownRenderer content={update.body} variant="prose" />
            </article>
          ))}
        </div>
      )}
      {(page > 1 || hasOlder) && (
        <nav className="mt-10 flex justify-between text-sm" aria-label="More updates">
          {page > 1 ? (
            <Link href={pageHref(workspace.slug, page - 1)} className="text-text-secondary hover:text-text-primary">
              ← Newer updates
            </Link>
          ) : (
            <span />
          )}
          {hasOlder && (
            <Link href={pageHref(workspace.slug, page + 1)} className="text-text-secondary hover:text-text-primary">
              Older updates →
            </Link>
          )}
        </nav>
      )}
    </UpdatesShell>
  );
}
