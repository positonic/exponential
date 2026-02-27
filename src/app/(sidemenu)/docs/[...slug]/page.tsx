import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDocContent, getAllDocSlugs } from "~/lib/docs/getDoc";
import { DocsSidebar, DocsContent, DocsTableOfContents } from "~/app/_components/docs";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

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
    return { title: "Page Not Found — Exponential Docs" };
  }

  const description = doc.meta.description ?? `Learn about ${doc.meta.title} in the Exponential documentation.`;
  const url = `https://www.exponential.im/docs/${slug.join('/')}`;

  return {
    title: `${doc.meta.title} — Exponential Docs`,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title: `${doc.meta.title} — Exponential Docs`,
      description,
      url,
      siteName: 'Exponential',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${doc.meta.title} — Exponential Docs`,
      description,
      images: ['/og-image.png'],
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
      <DocsSidebar />
      <DocsContent doc={doc}>
        <MarkdownRenderer content={doc.content} />
      </DocsContent>
      <div className="hidden lg:block">
        <DocsTableOfContents headings={doc.headings} />
      </div>
    </>
  );
}
