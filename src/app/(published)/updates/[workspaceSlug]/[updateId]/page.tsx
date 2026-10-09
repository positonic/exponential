import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import {
  getPublicUpdate,
  publicUpdatePath,
  publicUpdatesPath,
} from "~/server/services/workspaceUpdates/public";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { SubscribeForm } from "../../_components/SubscribeForm";
import { UpdatesShell, formatPublishedDate } from "../../_components/UpdatesShell";

/** Never cached, so turning the public page off takes this down at once. */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string; updateId: string }> };

function excerpt(markdown: string): string | undefined {
  const text = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug, updateId } = await params;
  const result = await getPublicUpdate(db, workspaceSlug, updateId);
  if (!result) return { title: "Not found" };
  const baseUrl = await getPublicBaseUrl();
  const url = `${baseUrl}${publicUpdatePath(workspaceSlug, updateId)}`;
  const description = excerpt(result.update.body);
  return {
    title: `${result.update.title} · ${result.workspace.name}`,
    description,
    alternates: { canonical: url },
    openGraph: { title: result.update.title, description, type: "article", url },
  };
}

/** One approved Workspace update, rendered from its approval snapshot. */
export default async function PublicUpdatePage({ params }: Params) {
  const { workspaceSlug, updateId } = await params;
  const result = await getPublicUpdate(db, workspaceSlug, updateId);
  if (!result) notFound();
  const { workspace, update } = result;

  return (
    <UpdatesShell
      workspaceName={workspace.name}
      indexHref={publicUpdatesPath(workspace.slug)}
      feedHref={`${publicUpdatesPath(workspace.slug)}/feed.xml`}
    >
      <article>
        <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">
          {workspace.name} · {formatPublishedDate(update.publishedAt)}
        </p>
        <h1 className="mb-6 text-3xl font-bold text-text-primary">{update.title}</h1>
        <MarkdownRenderer content={update.body} variant="prose" />
      </article>
      {workspace.acceptsSignups && (
        <div className="mt-12">
          <SubscribeForm workspaceSlug={workspace.slug} workspaceName={workspace.name} />
        </div>
      )}
      <p className="mt-12 text-sm">
        <Link href={publicUpdatesPath(workspace.slug)} className="text-text-muted hover:text-text-primary">
          ← All updates
        </Link>
      </p>
    </UpdatesShell>
  );
}
