import { notFound } from "next/navigation";
import { getDocContent, getAllDocSlugs } from "~/lib/docs/getDoc";
import { DocsSidebar, DocsContent, DocsTableOfContents } from "~/app/_components/docs";

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDocSlugs();
  return slugs.map((slug) => ({ slug }));
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
      <DocsContent doc={doc} />
      <div className="hidden lg:block">
        <DocsTableOfContents headings={doc.headings} />
      </div>
    </>
  );
}
