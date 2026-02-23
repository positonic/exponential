import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDocContent } from "~/lib/docs/getDoc";
import { DocsSidebar, DocsContent, DocsTableOfContents } from "~/app/_components/docs";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getDocContent([]);
  if (!doc) return { title: "Documentation | Exponential" };

  return {
    title: `${doc.meta.title} — Exponential Docs`,
    description: doc.meta.description ?? "Exponential documentation — learn how to use the platform.",
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
