import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TypographyStylesProvider } from "@mantine/core";
import type { JSONContent } from "@tiptap/core";

import { db } from "~/server/db";
import { getPublicBaseUrl } from "~/lib/urls";
import {
  buildPublicPagePath,
  parsePublicPageParam,
} from "~/lib/pages/public-url";
import {
  collectPageLinkIds,
  type PublicPageLinkMap,
} from "~/lib/pages/public-doc";
import { renderPublicPageHtml } from "~/server/services/pages/public-html";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { PublicThemeToggle } from "./_components/PublicThemeToggle";

// Live content (ADR-0038): unpublish must 404 immediately, so never cache.
export const dynamic = "force-dynamic";

/** One DB roundtrip shared by generateMetadata and the page render. */
const getPublishedPage = cache(async (param: string) => {
  const parsed = parsePublicPageParam(param);
  if (!parsed) return null;
  const page = await db.knowledgePage.findFirst({
    where: { publicId: parsed.publicId, isPublic: true },
    select: {
      title: true,
      body: true,
      bodyDoc: true,
      publicId: true,
      publicSlug: true,
      publicSeoIndexed: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      workspace: { select: { name: true } },
    },
  });
  if (!page) return null;
  return { page, requestSlug: parsed.slug };
});

/**
 * Resolve the `pageLink` targets of a doc that are themselves published, so
 * the render can link them to their public URLs with their live titles.
 * Resolution happens per request — the route is `force-dynamic` — so links go
 * live/dead the moment a target is published/unpublished, regardless of the
 * order the pages were published in.
 */
async function resolvePublishedPageLinks(
  bodyDoc: JSONContent,
): Promise<PublicPageLinkMap> {
  const ids = collectPageLinkIds(bodyDoc);
  if (ids.length === 0) return new Map();
  const targets = await db.knowledgePage.findMany({
    where: { id: { in: ids }, isPublic: true, publicId: { not: null } },
    select: { id: true, title: true, publicId: true, publicSlug: true },
  });
  return new Map(
    targets.map((t) => [
      t.id,
      {
        title: t.title,
        href: buildPublicPagePath(t.publicSlug ?? "untitled", t.publicId!),
      },
    ]),
  );
}

/** Plain-text excerpt of the Markdown projection for meta descriptions. */
function excerpt(markdown: string | null): string | undefined {
  if (!markdown) return undefined;
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugId: string }>;
}): Promise<Metadata> {
  const { slugId } = await params;
  const result = await getPublishedPage(slugId);
  if (!result) return { title: "Page not found" };

  const { page } = result;
  const baseUrl = await getPublicBaseUrl();
  const canonicalPath = buildPublicPagePath(
    page.publicSlug ?? "untitled",
    page.publicId!,
  );
  const description = excerpt(page.body);

  return {
    title: page.title,
    description,
    alternates: { canonical: `${baseUrl}${canonicalPath}` },
    // noindex by default; the per-page "Allow search engines" opt-in lifts it.
    robots: page.publicSeoIndexed ? undefined : { index: false, follow: false },
    openGraph: {
      title: page.title,
      description,
      type: "article",
      url: `${baseUrl}${canonicalPath}`,
    },
  };
}

export default async function PublishedPage({
  params,
}: {
  params: Promise<{ slugId: string }>;
}) {
  const { slugId } = await params;
  const result = await getPublishedPage(slugId);
  if (!result) notFound();

  const { page, requestSlug } = result;
  const canonicalSlug = page.publicSlug ?? "untitled";
  if (requestSlug !== canonicalSlug) {
    permanentRedirect(buildPublicPagePath(canonicalSlug, page.publicId!));
  }

  const html = page.bodyDoc
    ? renderPublicPageHtml(
        page.bodyDoc as JSONContent,
        await resolvePublishedPageLinks(page.bodyDoc as JSONContent),
      )
    : null;

  const updatedAt = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(page.updatedAt);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border-primary bg-background-primary/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Exponential
          </Link>
          <PublicThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <article>
          <h1 className="mb-2 text-3xl font-bold text-text-primary">
            {page.title}
          </h1>
          <p className="mb-8 text-sm text-text-muted">
            {[page.createdBy.name, page.workspace.name, `Updated ${updatedAt}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {html ? (
            <TypographyStylesProvider>
              {/* Server-generated from the schema-constrained ProseMirror doc
                  after the ADR-0038 sanitization pass — the deliberate, narrow
                  exception to the no-dangerouslySetInnerHTML rule. */}
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </TypographyStylesProvider>
          ) : page.body ? (
            <MarkdownRenderer content={page.body} variant="prose" />
          ) : (
            <p className="text-text-muted">This page is empty.</p>
          )}
        </article>
      </main>

      <footer className="border-t border-border-primary">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <Link
            href="/"
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            Published with Exponential
          </Link>
        </div>
      </footer>
    </div>
  );
}
