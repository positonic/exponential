"use client";

import { Title, Text } from "@mantine/core";
import type { DocContent } from "~/lib/docs/types";
import { DocsBreadcrumb } from "./DocsBreadcrumb";
import { DocsPrevNext } from "./DocsPrevNext";
import { DocsCallout } from "./DocsCallout";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

interface DocsContentProps {
  doc: DocContent;
}

export function DocsContent({ doc }: DocsContentProps) {
  return (
    <article className="min-w-0 flex-1 px-8 py-6">
      <div className="mx-auto max-w-3xl">
        <DocsBreadcrumb />

        {/* Page header */}
        <header className="mb-10 border-b border-border-primary pb-8">
          <Title order={1} className="mb-3">
            {doc.meta.title}
          </Title>
          {doc.meta.description && (
            <Text size="lg" className="leading-7 text-text-secondary">
              {doc.meta.description}
            </Text>
          )}
        </header>

        {/* Main content */}
        <div className="docs-content">
          <MarkdownRenderer content={doc.content} />
        </div>

        <DocsPrevNext />
      </div>
    </article>
  );
}

// Export DocsCallout for use in custom MDX if needed
export { DocsCallout };
