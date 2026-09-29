import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDocContent, getAllDocSlugs, getDocLastUpdated } from "~/lib/docs/getDoc";
import { docsEditUrl } from "~/lib/docs/content";
import { DocsContent, DocsTableOfContents } from "~/app/_components/docs";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { docsOgImageUrl } from "~/lib/docs/ogImage";

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDocSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug ?? [];
  const doc = await getDocContent(slug);

  if (!doc) {
    return { title: `Page Not Found — ${PRODUCT_NAME} Docs` };
  }

  const description = doc.meta.description ?? `Learn about ${doc.meta.title} in the ${PRODUCT_NAME} documentation.`;
  const url = `${getPublicBaseUrlFromEnv()}/docs/${slug.join('/')}`;

  return {
    title: `${doc.meta.title} — ${PRODUCT_NAME} Docs`,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title: `${doc.meta.title} — ${PRODUCT_NAME} Docs`,
      description,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: docsOgImageUrl(`/docs/${slug.join('/')}`), width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${doc.meta.title} — ${PRODUCT_NAME} Docs`,
      description,
      images: [docsOgImageUrl(`/docs/${slug.join('/')}`)],
    },
  };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug ?? [];

  const doc = await getDocContent(slug);

  if (!doc) {
    notFound();
  }

  return (
    <>
      <DocsContent
        doc={doc}
        lastUpdated={getDocLastUpdated(doc.filePath)}
        editUrl={docsEditUrl(doc.filePath)}
      >
        <MarkdownRenderer content={doc.content} format="markdown" />
      </DocsContent>
      <DocsTableOfContents headings={doc.headings} />
    </>
  );
}
