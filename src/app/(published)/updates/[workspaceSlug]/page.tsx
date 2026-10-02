import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import {
  listPublicUpdates,
  publicUpdatePath,
  publicUpdatesPath,
} from "~/server/services/workspaceUpdates/public";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { UpdatesShell, formatPublishedDate } from "../_components/UpdatesShell";

/** Approved updates change rarely; revalidate so new ones appear within minutes. */
export const revalidate = 300;

type Params = { params: Promise<{ workspaceSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const result = await listPublicUpdates(db, workspaceSlug);
  if (!result) return { title: "Not found" };
  const baseUrl = await getPublicBaseUrl();
  const title = `${result.workspace.name} updates`;
  const description = `What ${result.workspace.name} shipped, week by week.`;
  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}${publicUpdatesPath(workspaceSlug)}`,
      types: { "application/rss+xml": `${baseUrl}${publicUpdatesPath(workspaceSlug)}/feed.xml` },
    },
    openGraph: { title, description, type: "website", url: `${baseUrl}${publicUpdatesPath(workspaceSlug)}` },
  };
}

/**
 * A workspace's public updates: each approved Workspace update, newest first,
 * rendered from the snapshot frozen at approval. 404 unless the workspace
 * made its updates public.
 */
export default async function PublicUpdatesPage({ params }: Params) {
  const { workspaceSlug } = await params;
  const result = await listPublicUpdates(db, workspaceSlug);
  if (!result) notFound();
  const { workspace, updates } = result;

  return (
    <UpdatesShell
      workspaceName={workspace.name}
      indexHref={publicUpdatesPath(workspace.slug)}
      feedHref={`${publicUpdatesPath(workspace.slug)}/feed.xml`}
    >
      <h1 className="mb-2 text-3xl font-bold text-text-primary">What {workspace.name} shipped</h1>
      <p className="mb-10 text-sm text-text-muted">A short update every week, newest first.</p>
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
    </UpdatesShell>
  );
}
