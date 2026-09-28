"use client";

import type { ReactNode } from "react";
import { Title, Text } from "@mantine/core";
import { useSession } from "next-auth/react";
import type { DocContent } from "~/lib/docs/types";
import { DocsBreadcrumb } from "./DocsBreadcrumb";
import { DocsPrevNext } from "./DocsPrevNext";
import { DocsCallout } from "./DocsCallout";
import { DocsPageMeta } from "./DocsPageMeta";

interface DocsContentProps {
  doc: DocContent;
  lastUpdated: string | null;
  editUrl: string;
  children: ReactNode;
}

export function DocsContent({ doc, lastUpdated, editUrl, children }: DocsContentProps) {
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";

  return (
    <article className={`min-w-0 flex-1 px-4 pb-6 sm:px-8 ${isLoggedIn ? "py-6" : "pt-6 lg:pt-10"}`}>
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
          {children}
        </div>

        <DocsPageMeta lastUpdated={lastUpdated} editUrl={editUrl} />
        <DocsPrevNext />
      </div>
    </article>
  );
}

// Export DocsCallout for use in custom MDX if needed
export { DocsCallout };
