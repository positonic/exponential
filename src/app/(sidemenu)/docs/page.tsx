import { notFound } from "next/navigation";
import { getDocContent } from "~/lib/docs/getDoc";
import { DocsSidebar, DocsContent, DocsTableOfContents } from "~/app/_components/docs";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

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
