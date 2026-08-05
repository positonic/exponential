/**
 * ticketSync/markdownBlocks — render a ticket body (Markdown, ADR-0017) into
 * Notion block payloads for page creation (ivory.pike).
 *
 * Deliberately a hand-rolled SUBSET, not a full Markdown engine: headings,
 * fenced code blocks, bullet/numbered lists, blockquotes, dividers and
 * paragraphs, with inline bold / italic / inline-code / links as rich_text
 * annotations. Two hard rules:
 * - NEVER throws: any parse surprise degrades to plain paragraphs (the
 *   pre-fix behavior), because a body must never fail a page creation;
 * - respects Notion limits: rich_text content chunks stay under ~1900 chars
 *   and the block list is capped (a create call rejects >100 children).
 *
 * Pure — no Prisma, no Notion client.
 */

const MAX_TEXT_CHUNK = 1900;
/** Leave headroom under Notion's 100-children-per-create limit. */
const MAX_BLOCKS = 90;

/** Languages Notion's code block accepts; anything else falls back. */
const NOTION_LANGUAGES = new Set([
  "abap", "arduino", "bash", "basic", "c", "clojure", "coffeescript", "c++",
  "c#", "css", "dart", "diff", "docker", "elixir", "elm", "erlang", "flow",
  "fortran", "f#", "gherkin", "glsl", "go", "graphql", "groovy", "haskell",
  "html", "java", "javascript", "json", "julia", "kotlin", "latex", "less",
  "lisp", "livescript", "lua", "makefile", "markdown", "markup", "matlab",
  "mermaid", "nix", "objective-c", "ocaml", "pascal", "perl", "php",
  "plain text", "powershell", "prolog", "protobuf", "python", "r", "reason",
  "ruby", "rust", "sass", "scala", "scheme", "scss", "shell", "sql", "swift",
  "typescript", "vb.net", "verilog", "vhdl", "visual basic", "webassembly",
  "xml", "yaml",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  sh: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  "c++": "c++",
  cpp: "c++",
  cs: "c#",
  golang: "go",
  dockerfile: "docker",
  text: "plain text",
  txt: "plain text",
};

export interface RichTextSpan {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean };
}

function span(
  content: string,
  opts: { bold?: boolean; italic?: boolean; code?: boolean; url?: string } = {},
): RichTextSpan[] {
  const annotations: RichTextSpan["annotations"] = {};
  if (opts.bold) annotations.bold = true;
  if (opts.italic) annotations.italic = true;
  if (opts.code) annotations.code = true;
  const hasAnnotations = Object.keys(annotations).length > 0;
  return chunkText(content).map((piece) => ({
    type: "text" as const,
    text: { content: piece, ...(opts.url ? { link: { url: opts.url } } : {}) },
    ...(hasAnnotations ? { annotations } : {}),
  }));
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_TEXT_CHUNK) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += MAX_TEXT_CHUNK) {
    out.push(text.slice(i, i + MAX_TEXT_CHUNK));
  }
  return out;
}

/**
 * Inline Markdown → rich_text spans. One combined scanner; the earliest match
 * wins, inner content of bold/italic is parsed recursively (code spans and
 * link labels stay literal). Unmatched syntax passes through as plain text.
 */
const INLINE_PATTERN =
  /(`[^`\n]+`)|(\*\*[^*\n](?:[^\n]*?[^*\n])?\*\*)|(__[^_\n](?:[^\n]*?[^_\n])?__)|(\*[^*\s][^*\n]*?\*)|(_[^_\s][^_\n]*?_)|(\[[^\]\n]+\]\([^\s)]+\))/;

export function parseInline(text: string): RichTextSpan[] {
  const spans: RichTextSpan[] = [];
  let rest = text;
  let guard = 0;

  while (rest.length > 0 && guard++ < 10_000) {
    const match = INLINE_PATTERN.exec(rest);
    if (!match || match.index === undefined) {
      spans.push(...span(rest));
      break;
    }
    if (match.index > 0) spans.push(...span(rest.slice(0, match.index)));
    const token = match[0];

    if (token.startsWith("`")) {
      spans.push(...span(token.slice(1, -1), { code: true }));
    } else if (token.startsWith("**") || token.startsWith("__")) {
      for (const inner of parseInline(token.slice(2, -2))) {
        spans.push({
          ...inner,
          annotations: { ...inner.annotations, bold: true },
        });
      }
    } else if (token.startsWith("*") || token.startsWith("_")) {
      for (const inner of parseInline(token.slice(1, -1))) {
        spans.push({
          ...inner,
          annotations: { ...inner.annotations, italic: true },
        });
      }
    } else {
      // [label](url)
      const closeBracket = token.indexOf("](");
      const label = token.slice(1, closeBracket);
      const url = token.slice(closeBracket + 2, -1);
      spans.push(...span(label, { url }));
    }
    rest = rest.slice(match.index + token.length);
  }

  return spans.length > 0 ? spans : span("");
}

function block(type: string, richText: RichTextSpan[], extra: Record<string, unknown> = {}): unknown {
  return { object: "block", type, [type]: { rich_text: richText, ...extra } };
}

function normalizeLanguage(raw: string): string {
  const lang = raw.trim().toLowerCase();
  const resolved = LANGUAGE_ALIASES[lang] ?? lang;
  return NOTION_LANGUAGES.has(resolved) ? resolved : "plain text";
}

/** The pre-fix fallback: paragraph per blank-line-separated chunk, verbatim. */
function plainParagraphs(markdown: string): unknown[] {
  const blocks: unknown[] = [];
  for (const para of markdown.split(/\n{2,}/)) {
    const text = para.trim();
    if (!text) continue;
    blocks.push(block("paragraph", span(text)));
  }
  return blocks;
}

/**
 * Render Markdown into Notion block payloads. Never throws — on any internal
 * error the whole body degrades to the plain-paragraph rendering.
 */
export function markdownToNotionBlocks(markdown: string): unknown[] {
  try {
    return renderBlocks(markdown);
  } catch {
    return plainParagraphs(markdown);
  }
}

function renderBlocks(markdown: string): unknown[] {
  const blocks: unknown[] = [];
  const lines = markdown.split("\n");
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) blocks.push(block("paragraph", parseInline(text)));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Fenced code: consume until the closing fence (or EOF).
    const fence = /^(`{3,}|~{3,})\s*(\S*)\s*$/.exec(trimmed);
    if (fence) {
      flushParagraph();
      const marker = fence[1]![0]!;
      const language = normalizeLanguage(fence[2] ?? "");
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(marker.repeat(3))) {
        codeLines.push(lines[i]!);
        i++;
      }
      blocks.push(
        block("code", span(codeLines.join("\n")), { language }),
      );
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1]!.length, 3);
      blocks.push(block(`heading_${level}`, parseInline(heading[2] ?? "")));
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ object: "block", type: "divider", divider: {} });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      blocks.push(block("bulleted_list_item", parseInline(bullet[1] ?? "")));
      continue;
    }

    const numbered = /^\d{1,4}[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flushParagraph();
      blocks.push(block("numbered_list_item", parseInline(numbered[1] ?? "")));
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      blocks.push(
        block("quote", parseInline(trimmed.replace(/^>\s?/, ""))),
      );
      continue;
    }

    paragraph.push(line);
  }
  flushParagraph();

  if (blocks.length > MAX_BLOCKS) {
    const kept = blocks.slice(0, MAX_BLOCKS);
    kept.push(
      block(
        "paragraph",
        span(
          `… body truncated (${blocks.length - MAX_BLOCKS} more blocks) — see the full ticket in Exponential.`,
        ),
      ),
    );
    return kept;
  }
  return blocks;
}
