/**
 * Builds /llms.txt and /llms-full.txt from content/docs, so agents read the
 * same documentation people do. Pure over the page list, for testing.
 * See https://llmstxt.org for the llms.txt shape.
 */
import { buildDocsNavigation, listDocPages } from "./content";
import type { DocNavSection, DocPage } from "./types";

const TAGLINE =
  "Productivity OS that turns meeting transcripts into projects, actions and decisions, with an assistant (Zoe), external agents, and product-management tools.";

function pageUrl(baseUrl: string, href: string): string {
  return `${baseUrl}${href}`;
}

/** Pages in sidebar order (sections, then items, then nested children). */
function orderedPages(pages: DocPage[], nav: DocNavSection[]): { section: string; page: DocPage }[] {
  const byHref = new Map(pages.map((p) => [p.href, p]));
  const out: { section: string; page: DocPage }[] = [];
  for (const section of nav) {
    for (const item of section.items) {
      const page = byHref.get(item.href);
      if (page) out.push({ section: section.title, page });
      for (const child of item.children ?? []) {
        const c = byHref.get(child.href);
        if (c) out.push({ section: section.title, page: c });
      }
    }
  }
  return out;
}

export function buildLlmsIndex(opts: {
  productName: string;
  baseUrl: string;
  pages?: DocPage[];
  nav?: DocNavSection[];
  /** Extra sections appended verbatim (Markdown), e.g. the bounty API. */
  appendix?: string;
}): string {
  const pages = opts.pages ?? listDocPages();
  const nav = opts.nav ?? buildDocsNavigation(pages);
  const lines: string[] = [
    `# ${opts.productName}`,
    "",
    `> ${TAGLINE}`,
    "",
    `The full documentation as one Markdown file: ${pageUrl(opts.baseUrl, "/llms-full.txt")}`,
    "",
  ];
  let current = "";
  for (const { section, page } of orderedPages(pages, nav)) {
    if (section !== current) {
      if (current) lines.push("");
      lines.push(`## ${section}`, "");
      current = section;
    }
    const desc = page.meta.description ? `: ${page.meta.description}` : "";
    lines.push(`- [${page.meta.title}](${pageUrl(opts.baseUrl, page.href)})${desc}`);
  }
  lines.push("");
  if (opts.appendix) lines.push(opts.appendix.trim(), "");
  return lines.join("\n");
}

export function buildLlmsFull(opts: {
  productName: string;
  baseUrl: string;
  pages?: DocPage[];
  nav?: DocNavSection[];
}): string {
  const pages = opts.pages ?? listDocPages();
  const nav = opts.nav ?? buildDocsNavigation(pages);
  const parts: string[] = [`# ${opts.productName} documentation`, "", `> ${TAGLINE}`, ""];
  for (const { section, page } of orderedPages(pages, nav)) {
    parts.push(
      "---",
      "",
      `# ${page.meta.title}`,
      "",
      `Section: ${section} · URL: ${pageUrl(opts.baseUrl, page.href)}`,
      "",
      page.meta.description ? `> ${page.meta.description}\n` : "",
      // Relative links and images resolve against the site for a reader outside it.
      page.content
        .trim()
        .replace(/\]\((\/[^)\s]*)\)/g, (_m, href: string) => `](${opts.baseUrl}${href})`),
      "",
    );
  }
  return parts.join("\n");
}
