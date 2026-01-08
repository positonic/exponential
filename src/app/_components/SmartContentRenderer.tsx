"use client";

import DOMPurify from "dompurify";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Text, Title } from "@mantine/core";

interface SmartContentRendererProps {
  content: string | null;
  isPreview?: boolean;
  maxLines?: number;
  className?: string;
}

type ContentType = "html" | "markdown" | "text";

/**
 * Detect content type based on patterns in the content
 */
function detectContentType(content: string): ContentType {
  // HTML detection - check for common HTML tags
  const htmlPattern =
    /<(p|div|span|br|a|strong|em|ul|ol|li|h[1-6]|table|img|blockquote|pre|code)[^>]*>/i;
  if (htmlPattern.test(content)) return "html";

  // Markdown detection - check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /\*\*[^*]+\*\*/, // Bold
    /(?<!\*)\*[^*]+\*(?!\*)/, // Italic (not bold)
    /\[[^\]]+\]\([^)]+\)/, // Links
    /^[-*+]\s/m, // Unordered lists
    /^\d+\.\s/m, // Ordered lists
    /```[\s\S]*?```/, // Code blocks
    /`[^`]+`/, // Inline code
    /^>\s/m, // Blockquotes
  ];
  if (markdownPatterns.some((pattern) => pattern.test(content)))
    return "markdown";

  return "text";
}

/**
 * Markdown components for ReactMarkdown with Mantine styling
 */
const markdownComponents: Partial<Components> = {
  h1: ({ children, ...props }) => (
    <Title order={1} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h2: ({ children, ...props }) => (
    <Title order={2} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h3: ({ children, ...props }) => (
    <Title order={3} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h4: ({ children, ...props }) => (
    <Title order={4} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h5: ({ children, ...props }) => (
    <Title order={5} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h6: ({ children, ...props }) => (
    <Title order={6} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mb-4 list-disc pl-6" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mb-4 list-decimal pl-6" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="mb-2" {...props}>
      {children}
    </li>
  ),
  p: ({ children }: React.HTMLProps<HTMLParagraphElement>) => (
    <Text size="sm" mb="sm">
      {children}
    </Text>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-border-primary pl-4 italic text-text-secondary"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-sm"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="block overflow-x-auto rounded bg-surface-secondary p-3 font-mono text-sm"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="my-4 overflow-x-auto rounded bg-surface-secondary p-0" {...props}>
      {children}
    </pre>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-brand-primary hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

/**
 * Render HTML content safely with DOMPurify
 */
function HTMLRenderer({
  content,
  isPreview,
  maxLines,
}: {
  content: string;
  isPreview?: boolean;
  maxLines?: number;
}) {
  const sanitizedHtml = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "p",
      "div",
      "span",
      "br",
      "a",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
    ALLOW_DATA_ATTR: false,
  });

  return (
    <div
      className={`prose prose-sm max-w-none text-text-primary ${isPreview && maxLines ? `line-clamp-${maxLines}` : ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

/**
 * Render plain text content with preserved whitespace
 */
function TextRenderer({
  content,
  isPreview,
  maxLines,
}: {
  content: string;
  isPreview?: boolean;
  maxLines?: number;
}) {
  return (
    <Text
      size="sm"
      className="text-text-primary"
      style={{
        whiteSpace: "pre-wrap",
        ...(isPreview && maxLines
          ? {
              display: "-webkit-box",
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }
          : {}),
      }}
    >
      {content}
    </Text>
  );
}

/**
 * SmartContentRenderer - Detects content type (HTML, Markdown, or plain text)
 * and renders it appropriately.
 */
export function SmartContentRenderer({
  content,
  isPreview = false,
  maxLines,
  className,
}: SmartContentRendererProps) {
  if (!content) return null;

  const contentType = detectContentType(content);

  const wrapperClass = `${className ?? ""} ${isPreview && maxLines ? "overflow-hidden" : ""}`.trim();

  return (
    <div className={wrapperClass || undefined}>
      {contentType === "html" && (
        <HTMLRenderer content={content} isPreview={isPreview} maxLines={maxLines} />
      )}
      {contentType === "markdown" && (
        <div
          className={isPreview && maxLines ? `line-clamp-${maxLines}` : undefined}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
      {contentType === "text" && (
        <TextRenderer content={content} isPreview={isPreview} maxLines={maxLines} />
      )}
    </div>
  );
}
