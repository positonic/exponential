import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import DOMPurify from "dompurify";
import { CodeHighlight } from "@mantine/code-highlight";
import { Badge, Title, Text } from "@mantine/core";
import type { ReactNode } from "react";
import {
  remarkMentions,
  MENTION_CLASS,
  MENTION_UNKNOWN_CLASS,
} from "~/lib/content/remarkMentions";
import { remarkSoftBreaks } from "~/lib/content/remarkSoftBreaks";
import { detectContentType } from "~/lib/content/contentFormat";
import { MarkdownImage } from "~/app/_components/shared/MarkdownImage";

/**
 * The canonical renderer for authored prose (ADR-0016). Markdown is the
 * canonical stored format; legacy HTML is tolerated on read (sanitised). Use
 * `variant="prose"` for long-form surfaces (docs, blog, descriptions) and
 * `variant="compact"` for dense surfaces (activity feed, comments, chat).
 *
 * Server-capable: the markdown path renders on the server so RSC pages keep
 * their HTML. The only client-only piece (the image lightbox) lives in the
 * separate MarkdownImage component.
 */

export type MarkdownVariant = "prose" | "compact";

// Safely extract text from React children
function getTextFromChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return children.toString();
  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    return getTextFromChildren(
      (children as { props?: { children?: ReactNode } }).props?.children,
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

function normalizeClassName(className: unknown): string {
  if (Array.isArray(className)) return className.join(" ");
  return typeof className === "string" ? className : "";
}

interface BuildOptions {
  onDeleteImage?: (url: string) => void;
}

function buildComponents(
  variant: MarkdownVariant,
  options: BuildOptions,
): Partial<Components> {
  const { onDeleteImage } = options;
  const compact = variant === "compact";

  // Shared inline elements (identical across variants)
  const inlineComponents: Partial<Components> = {
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
    strong: ({ children }) => (
      <strong className="font-semibold text-text-primary">{children}</strong>
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
        <div
          className={`overflow-hidden rounded-lg border border-border-primary ${compact ? "my-2" : "my-4"}`}
        >
          <CodeHighlight code={codeString} language={language ?? "text"} />
        </div>
      );
    },
    pre: ({ children }) => <>{children}</>,
    // Mentions arrive as spans tagged by the remarkMentions plugin.
    span: ({ className, children }) => {
      const cls = normalizeClassName(className);
      if (cls.includes(MENTION_UNKNOWN_CLASS)) {
        return <span>{children}</span>;
      }
      if (cls.includes(MENTION_CLASS)) {
        return (
          <Badge
            size="xs"
            variant="light"
            color="blue"
            className="mx-0.5 align-middle"
          >
            {children}
          </Badge>
        );
      }
      return <span className={cls || undefined}>{children}</span>;
    },
    img: ({ src, alt }) => {
      if (compact) {
        return (
          <MarkdownImage
            src={typeof src === "string" ? src : undefined}
            alt={alt}
            onDelete={onDeleteImage}
          />
        );
      }
      return (
        <span className="my-8 block">
          <img
            src={typeof src === "string" ? src : undefined}
            alt={alt ?? ""}
            className="w-full rounded-lg border border-border-primary shadow-sm"
          />
        </span>
      );
    },
  };

  if (compact) {
    return {
      ...inlineComponents,
      h1: ({ children }) => (
        <p className="mb-2 mt-3 text-base font-semibold text-text-primary first:mt-0">
          {children}
        </p>
      ),
      h2: ({ children }) => (
        <p className="mb-2 mt-3 text-sm font-semibold text-text-primary first:mt-0">
          {children}
        </p>
      ),
      h3: ({ children }) => (
        <p className="mb-1 mt-2 text-sm font-semibold text-text-primary first:mt-0">
          {children}
        </p>
      ),
      h4: ({ children }) => (
        <p className="mb-1 mt-2 text-sm font-semibold text-text-secondary first:mt-0">
          {children}
        </p>
      ),
      p: ({ children }) => (
        <p className="mb-2 text-sm leading-6 text-text-secondary last:mb-0">
          {children}
        </p>
      ),
      ul: ({ children }) => (
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-text-secondary last:mb-0">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary last:mb-0">
          {children}
        </ol>
      ),
      li: ({ children }) => <li className="leading-6">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-2 border-blue-500/50 bg-surface-secondary py-1 pl-3 text-sm italic text-text-secondary">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-border-primary" />,
      table: ({ children }) => (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">{children}</table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="border-b border-border-primary bg-surface-secondary">
          {children}
        </thead>
      ),
      th: ({ children }) => (
        <th className="px-2 py-1 text-left font-semibold text-text-primary">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-b border-border-primary px-2 py-1 text-text-secondary">
          {children}
        </td>
      ),
    };
  }

  // prose (default) — unchanged article styling
  return {
    ...inlineComponents,
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
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-4 border-blue-500/50 bg-surface-secondary py-2 pl-4 italic text-text-secondary">
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
  };
}

/** Tags allowed when rendering tolerated legacy HTML (Tiptap output). */
const ALLOWED_HTML_TAGS = [
  "p",
  "br",
  "span",
  "div",
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
  "img",
  "hr",
  "mark",
];

interface MarkdownRendererProps {
  content: string;
  /** Spacing preset. Defaults to long-form "prose". */
  variant?: MarkdownVariant;
  /** Names that should render as mention badges (compact surfaces). */
  mentionNames?: string[];
  /** Owner-only image delete handler (compact surfaces, e.g. comments). */
  onDeleteImage?: (url: string) => void;
  className?: string;
}

export function MarkdownRenderer({
  content,
  variant = "prose",
  mentionNames,
  onDeleteImage,
  className,
}: MarkdownRendererProps) {
  // Tolerate legacy HTML on read (sanitised). New writes are always Markdown.
  if (detectContentType(content) === "html") {
    const clean = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ALLOWED_HTML_TAGS,
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class"],
      ALLOW_DATA_ATTR: false,
    });
    return (
      <div
        className={className}
        // Sanitised directly above; this is the canonical tolerated-HTML path.
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  const remarkPlugins: PluggableList = [remarkGfm];
  // Compact surfaces are textarea-authored: preserve typed line breaks.
  if (variant === "compact") remarkPlugins.push(remarkSoftBreaks);
  if (mentionNames && mentionNames.length > 0) {
    remarkPlugins.push([remarkMentions, mentionNames]);
  }

  const body = (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={buildComponents(variant, { onDeleteImage })}
    >
      {content}
    </ReactMarkdown>
  );

  return className ? <div className={className}>{body}</div> : body;
}
