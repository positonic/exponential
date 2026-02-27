import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDocContent } from "~/lib/docs/getDoc";
import { DocsSidebar, DocsContent, DocsTableOfContents } from "~/app/_components/docs";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getDocContent([]);
  if (!doc) return { title: "Documentation | Exponential" };

  const description = doc.meta.description ?? "Exponential documentation — learn how to use the platform.";

  return {
    title: `${doc.meta.title} — Exponential Docs`,
    description,
    alternates: {
      canonical: "https://www.exponential.im/docs",
    },
    openGraph: {
      type: 'website',
      title: `${doc.meta.title} — Exponential Docs`,
      description,
      url: "https://www.exponential.im/docs",
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

export default async function DocsIndexPage() {
  const doc = await getDocContent([]);

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
