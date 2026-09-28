/**
 * Docs guardrails, run in CI (`npm run docs:check`) and before every docs PR.
 *
 * Fails (exit 1) when any page under `content/docs`:
 *   - links to a `/docs/...` page that does not exist, or to a `#anchor`
 *     that no H2/H3 on the target page produces;
 *   - references a `/doc-assets/...` file that is not in `public/`;
 *   - links to an absolute exponential.im URL (relative links only, so the
 *     docs work on staging, previews and sovereign installs);
 *   - says "**Label** in the sidebar" with a label that is not a real app
 *     sidebar item (`NAV_ITEM_CONFIG`, the nav sections, Inbox/Today/Time)
 *     or a settings tab (account or workspace settings);
 *   - has no `title` or `description` frontmatter;
 *   - is missing from `content/docs/_last-updated.json` (run
 *     `npm run docs:last-updated`).
 * It also checks that every redirect in `content/docs/_redirects.json`
 * points at a page that exists and that no redirect source is itself a page.
 *
 * Code blocks are ignored so command examples can contain anything.
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { listDocPages, DOCS_DIR } from "../src/lib/docs/content";
import { extractHeadings } from "../src/lib/docs/extractHeadings";
import { readLastUpdatedMap } from "../src/lib/docs/lastUpdated";
import { DEFAULT_NAV_LAYOUT, NAV_ITEM_CONFIG } from "../src/lib/navLayout";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

interface Problem {
  file: string;
  line: number;
  message: string;
}

const problems: Problem[] = [];
const fail = (file: string, line: number, message: string) => problems.push({ file, line, message });

/** Replace fenced and inline code with spaces of equal length so line numbers survive. */
function stripCode(markdown: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  return markdown
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/~~~[\s\S]*?~~~/g, blank)
    .replace(/`[^`\n]*`/g, blank);
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Labels a doc may claim to be "in the sidebar". */
function allowedSidebarLabels(): Set<string> {
  const labels = new Set<string>();
  for (const cfg of Object.values(NAV_ITEM_CONFIG)) labels.add(cfg.label);
  for (const section of DEFAULT_NAV_LAYOUT) labels.add(section.name);

  // Global items at the top of the sidebar: `<NavLink href="/inbox" …>Inbox</NavLink>`.
  const navLinks = fs.readFileSync(path.join(ROOT, "src/app/_components/layout/NavLinks.tsx"), "utf-8");
  for (const m of navLinks.matchAll(/<NavLink href=["']\/[^"']*["'][\s\S]*?>\s*([A-Za-z][A-Za-z ]*?)\s*<\/NavLink>/g)) {
    labels.add(m[1]!);
  }

  // Settings tabs, account (`const GROUPS`) and workspace (`const groups`).
  const settingsSources: [string, string, string][] = [
    ["src/app/(sidemenu)/settings/layout.tsx", "const GROUPS", "];"],
    ["src/app/(sidemenu)/w/[workspaceSlug]/settings/page.tsx", "const groups: SidebarGroup", "];"],
  ];
  for (const [rel, start, end] of settingsSources) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf-8");
    const from = src.indexOf(start);
    if (from === -1) throw new Error(`check-docs: could not find "${start}" in ${rel} — update the settings-tab extraction`);
    const to = src.indexOf(end, from);
    const block = src.slice(from, to === -1 ? undefined : to);
    let found = 0;
    for (const m of block.matchAll(/label:\s*'([^']+)'/g)) {
      labels.add(m[1]!);
      found++;
    }
    if (found === 0) throw new Error(`check-docs: no settings tab labels found in ${rel}`);
  }
  return labels;
}

/** Files gray-matter cannot parse are skipped by listDocPages; report them here. */
function frontmatterErrors(): Problem[] {
  const out: Problem[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        try {
          matter(fs.readFileSync(full, "utf-8"));
        } catch (error) {
          out.push({
            file: path.relative(ROOT, full),
            line: 1,
            message: `frontmatter does not parse (quote values containing ": "): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
          });
        }
      }
    }
  };
  walk(DOCS_DIR);
  return out;
}

function main() {
  problems.push(...frontmatterErrors());
  const pages = listDocPages(DOCS_DIR);
  const byHref = new Map(pages.map((p) => [p.href, p]));
  const headingIds = new Map(pages.map((p) => [p.href, new Set(extractHeadings(p.content).map((h) => h.id))]));
  const labels = allowedSidebarLabels();
  const lastUpdated = readLastUpdatedMap();
  const hasLastUpdatedMap = Object.keys(lastUpdated).length > 0;

  const LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const HTML_SRC_RE = /<(?:a|img)\b[^>]*?(?:href|src)=["']([^"']+)["']/g;
  const SIDEBAR_RE = /\*\*(\S(?:[^*\n]*\S)?)\*\*[^.\n]{0,25}?\bin the sidebar/g;
  const ABSOLUTE_SELF_RE = /^https?:\/\/(www\.)?exponential\.im(\/|$)/;

  for (const page of pages) {
    const text = stripCode(page.content);
    const file = page.filePath;
    // `page.content` has the frontmatter removed; report line numbers in the file.
    const raw = fs.readFileSync(path.join(ROOT, file), "utf-8");
    const offset = raw.split("\n").length - page.content.split("\n").length;
    const lineOf = (index: number) => lineAt(text, index) + offset;

    if (!page.meta.title || page.meta.title === "Documentation") fail(file, 1, "frontmatter is missing `title`");
    if (!page.meta.description) fail(file, 1, "frontmatter is missing `description` (used by search and the page header)");
    if (hasLastUpdatedMap && !lastUpdated[file]) {
      fail(file, 1, "not in content/docs/_last-updated.json — run `npm run docs:last-updated` and commit the result");
    }

    const targets: { url: string; line: number; isImage: boolean }[] = [];
    for (const m of text.matchAll(LINK_RE)) {
      targets.push({ url: m[3]!, line: lineOf(m.index ?? 0), isImage: m[1] === "!" });
    }
    for (const m of text.matchAll(HTML_SRC_RE)) {
      targets.push({ url: m[1]!, line: lineOf(m.index ?? 0), isImage: m[0].startsWith("<img") });
    }

    for (const { url, line, isImage } of targets) {
      if (ABSOLUTE_SELF_RE.test(url)) {
        fail(file, line, `absolute link to ${url} — use the relative path instead`);
        continue;
      }
      if (/^(https?:|mailto:|tel:)/.test(url)) continue;

      const [pathPart, anchor] = url.split("#") as [string, string | undefined];
      const cleanPath = pathPart.split("?")[0]!;

      if (cleanPath.startsWith("/doc-assets/")) {
        if (!fs.existsSync(path.join(PUBLIC_DIR, cleanPath))) fail(file, line, `missing asset public${cleanPath}`);
        continue;
      }
      if (isImage) {
        fail(file, line, `image "${url}" must live under /doc-assets/`);
        continue;
      }
      if (cleanPath === "") {
        if (anchor !== undefined && !headingIds.get(page.href)?.has(anchor)) {
          fail(file, line, `anchor #${anchor} does not match any H2/H3 on this page`);
        }
        continue;
      }
      if (cleanPath === "/docs" || cleanPath.startsWith("/docs/")) {
        const href = cleanPath.replace(/\/$/, "") || "/docs";
        const target = byHref.get(href);
        if (!target) {
          fail(file, line, `broken docs link ${url}`);
          continue;
        }
        if (anchor !== undefined && !headingIds.get(href)?.has(anchor)) {
          fail(file, line, `link ${url}: no H2/H3 on ${href} produces #${anchor}`);
        }
        continue;
      }
      if (!cleanPath.startsWith("/")) {
        fail(file, line, `relative link "${url}" — docs links must start with /docs/ (or / for app routes)`);
      }
      // Other `/app/routes` are allowed and not validated here.
    }

    for (const m of text.matchAll(SIDEBAR_RE)) {
      const label = m[1]!.trim();
      // "**Align → Goals** in the sidebar" names a section and an item; each part must be real.
      const parts = label.split(/\s*(?:→|->|>)\s*/).map((p) => p.trim()).filter(Boolean);
      if (!parts.every((p) => labels.has(p))) {
        fail(
          file,
          lineOf(m.index ?? 0),
          `"**${label}** in the sidebar" — no sidebar item or settings tab is called "${label}"`,
        );
      }
    }
  }

  const redirectsFile = path.join(DOCS_DIR, "_redirects.json");
  if (fs.existsSync(redirectsFile)) {
    const { redirects } = JSON.parse(fs.readFileSync(redirectsFile, "utf-8")) as { redirects: Record<string, string> };
    for (const [source, destination] of Object.entries(redirects)) {
      const rel = path.relative(ROOT, redirectsFile);
      if (!byHref.has(destination.split("#")[0]!)) fail(rel, 1, `redirect ${source} → ${destination}: target page does not exist`);
      if (byHref.has(source)) fail(rel, 1, `redirect source ${source} is also a live page — remove one`);
    }
  }

  if (problems.length) {
    problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    for (const p of problems) console.error(`${p.file}:${p.line}: ${p.message}`);
    console.error(`\ncheck-docs: ${problems.length} problem(s) across ${pages.length} pages`);
    process.exit(1);
  }
  console.log(`check-docs: ${pages.length} pages OK (links, anchors, assets, sidebar labels, frontmatter, last-updated)`);
}

main();
