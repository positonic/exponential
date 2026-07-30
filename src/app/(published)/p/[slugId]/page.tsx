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
      id: true,
      workspaceId: true,
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

/** A published parent for the breadcrumb: its live title and public path. */
interface PublicParent {
  title: string;
  href: string;
}

/**
 * Resolve the published parent of a page for the public breadcrumb (ADR-0038:
 * render a link to the parent only when the parent is itself published). Nesting
 * is the `pageLink` graph (ADR-0039), so this is the reverse lookup used in-app
 * by `page.parentCrumb`, narrowed to `isPublic` linkers: same-workspace pages
 * whose `bodyDoc` links this page (cheap `::text` LIKE prefilter, then confirmed
 * with {@link collectPageLinkIds} to reject incidental text matches). The
 * newest-edited published linker wins; returns null when none is published.
 */
async function resolvePublishedParent(
  pageId: string,
  workspaceId: string,
): Promise<PublicParent | null> {
  // Escape LIKE wildcards so a pathological id can't broaden the prefilter.
  // Use a replacer function (not "\\$&") so the backslash is emitted literally
  // and `%`/`_`/`\` are each prefixed with a real escape backslash.
  const likePattern = `%${pageId.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "KnowledgePage"
    WHERE "workspaceId" = ${workspaceId}
      AND "id" <> ${pageId}
      AND "isPublic" = true
      AND "publicId" IS NOT NULL
      AND "bodyDoc"::text LIKE ${likePattern}
    ORDER BY "updatedAt" DESC
    LIMIT 20
  `;
  if (rows.length === 0) return null;

  const candidates = await db.knowledgePage.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true,
      title: true,
      bodyDoc: true,
      publicId: true,
      publicSlug: true,
    },
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  // Preserve the raw query's newest-edited-first order.
  for (const { id } of rows) {
    const candidate = byId.get(id);
    if (!candidate?.publicId) continue;
    const links = collectPageLinkIds(candidate.bodyDoc as JSONContent | null);
    if (!links.includes(pageId)) continue;
    return {
      title: candidate.title,
      href: buildPublicPagePath(candidate.publicSlug ?? "untitled", candidate.publicId),
    };
  }
  return null;
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

  const parent = await resolvePublishedParent(page.id, page.workspaceId);

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
          {parent ? (
            <nav aria-label="Breadcrumb" className="mb-3 text-sm text-text-muted">
              <Link
                href={parent.href}
                className="transition-colors hover:text-text-primary"
              >
                {parent.title}
              </Link>
              <span className="px-1.5">/</span>
              <span className="text-text-secondary">{page.title}</span>
            </nav>
          ) : null}
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
                  exception to the no-dangerouslySetInnerHTML rule.
                  `prd-document` is the same class the in-app editor/viewer sets:
                  Tailwind Preflight strips list markers and list padding, and
                  TypographyStylesProvider has no ul/ol rules to put them back, so
                  without it bullets and numbers vanish on the public render (it
                  also carries the table and task-list styling). */}
              <div className="prd-document" dangerouslySetInnerHTML={{ __html: html }} />
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
