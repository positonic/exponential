"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { CodeHighlight } from "@mantine/code-highlight";
import { Title, Text } from "@mantine/core";
import type { DocContent } from "~/lib/docs/types";
import { DocsBreadcrumb } from "./DocsBreadcrumb";
import { DocsPrevNext } from "./DocsPrevNext";
import { DocsCallout } from "./DocsCallout";
import type { ReactNode } from "react";

interface DocsContentProps {
  doc: DocContent;
}

// Safely extract text from React children
function getTextFromChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return children.toString();
  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    return getTextFromChildren(
      (children as { props?: { children?: ReactNode } }).props?.children
    );
  }
  return "";
}

// Generate ID from heading text
function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

const markdownComponents: Partial<Components> = {
  h1: ({ children }) => (
    <Title order={1} className="mb-6 mt-12 first:mt-0">
      {children}
    </Title>
  ),
  h2: ({ children }) => {
    const text = getTextFromChildren(children);
    const id = generateId(text);
    return (
      <Title order={2} id={id} className="mb-4 mt-12 scroll-mt-4 first:mt-0">
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      </Title>
    );
  },
  h3: ({ children }) => {
    const text = getTextFromChildren(children);
    const id = generateId(text);
    return (
      <Title order={3} id={id} className="mb-3 mt-8 scroll-mt-4">
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      </Title>
    );
  },
  h4: ({ children }) => (
    <Title order={4} className="mb-3 mt-6">
      {children}
    </Title>
  ),
  p: ({ children }) => (
    <Text size="md" className="mb-5 leading-7 text-text-secondary">
      {children}
    </Text>
  ),
  ul: ({ children }) => (
    <ul className="mb-6 list-disc space-y-3 pl-6 text-text-secondary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-6 list-decimal space-y-3 pl-6 text-text-secondary">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-blue-500 underline decoration-blue-500/30 underline-offset-2 transition-colors hover:decoration-blue-500"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className ?? "");
    const language = match ? match[1] : undefined;
    const codeString = getTextFromChildren(children).replace(/\n$/, "");

    // Inline code
    if (!language && !codeString.includes("\n")) {
      return (
        <code className="rounded bg-surface-tertiary px-1.5 py-0.5 font-mono text-sm text-text-primary">
          {children}
        </code>
      );
    }

    // Code block
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-border-primary">
        <CodeHighlight code={codeString} language={language ?? "text"} />
      </div>
    );
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-blue-500/50 bg-surface-secondary pl-4 py-2 italic text-text-secondary">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-border-primary" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border-primary bg-surface-secondary">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 text-left font-semibold text-text-primary">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border-primary px-4 py-2 text-text-secondary">
      {children}
    </td>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  img: ({ src, alt }) => (
    <span className="my-8 block">
      <img
        src={src}
        alt={alt ?? ""}
        className="w-full rounded-lg border border-border-primary shadow-sm"
      />
    </span>
  ),
};

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
          <ReactMarkdown components={markdownComponents}>
            {doc.content}
          </ReactMarkdown>
        </div>

        <DocsPrevNext />
      </div>
    </article>
  );
}

// Export DocsCallout for use in custom MDX if needed
export { DocsCallout };
