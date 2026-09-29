/**
 * Regenerates content/docs/whats-new.md from pull requests merged into main:
 * `feat` PRs under "New", `fix` PRs under "Fixed", grouped by month, newest
 * first, for the last WHATS_NEW_DAYS days (default 90). Everything else
 * (chore, refactor, perf, test, ci, docs) is left to the live product
 * timeline, which the page links.
 *
 *   npm run docs:whats-new
 *
 * Needs the GitHub CLI signed in (`gh auth status`). Run it at release time
 * and review the diff like any docs change: titles are written for
 * reviewers, so reword any that do not read well to a user.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

interface MergedPr {
  number: number;
  title: string;
  mergedAt: string;
  url: string;
}

const DAYS = Number(process.env.WHATS_NEW_DAYS ?? 90);
const OUT = path.resolve(process.cwd(), "content/docs/whats-new.md");
const TYPE_RE = /^(feat|fix)(\([^)]*\))?!?:\s*(.+)$/i;

export function formatTitle(raw: string): { kind: "New" | "Fixed"; area: string | null; text: string } | null {
  const m = TYPE_RE.exec(raw.trim());
  if (!m) return null;
  const kind = m[1]!.toLowerCase() === "feat" ? "New" : "Fixed";
  const area = m[2] ? m[2].slice(1, -1) : null;
  const text = m[3]!.trim().replace(/\s+\(#\d+\)$/, "");
  // Titles are plain text. Encode angle brackets: a title like "…a single <br>"
  // would otherwise make the renderer treat the whole page as legacy HTML.
  const safe = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return { kind, area, text: safe.charAt(0).toUpperCase() + safe.slice(1) };
}

export function renderWhatsNew(prs: MergedPr[], today: string): string {
  const byMonth = new Map<string, { New: string[]; Fixed: string[] }>();
  for (const pr of [...prs].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))) {
    const f = formatTitle(pr.title);
    if (!f) continue;
    const month = new Date(pr.mergedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const bucket = byMonth.get(month) ?? { New: [], Fixed: [] };
    const area = f.area ? `**${f.area}** — ` : "";
    bucket[f.kind].push(`- ${area}${f.text} ([#${pr.number}](${pr.url}))`);
    byMonth.set(month, bucket);
  }

  const out: string[] = [
    "---",
    "title: What's new",
    `description: "User-visible changes from the last ${DAYS} days, newest first; the full history is on the product timeline"`,
    "section: get-started",
    "order: 4",
    "icon: IconRocket",
    `updated: ${today}`,
    "---",
    "",
    `Features added and bugs fixed in Exponential over the last ${DAYS} days, grouped by month. Each line links the change on GitHub. For every commit, including internal work, see the live [product timeline](/product-timeline).`,
    "",
  ];
  if (byMonth.size === 0) out.push("No user-visible changes in this period.", "");
  for (const [month, { New, Fixed }] of byMonth) {
    out.push(`## ${month}`, "");
    if (New.length) out.push("### New", "", ...New, "");
    if (Fixed.length) out.push("### Fixed", "", ...Fixed, "");
  }
  out.push("## How it connects", "", "- **Product timeline** — every commit, as it lands: [product timeline](/product-timeline).", "- **Introduction** — what Exponential is, if you are new: [Introduction](/docs).", "");
  return out.join("\n");
}

function main() {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);
  const json = execFileSync(
    "gh",
    ["pr", "list", "--state", "merged", "--base", "main", "--limit", "1000", "--search", `merged:>=${since}`, "--json", "number,title,mergedAt,url"],
    { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 },
  );
  const prs = JSON.parse(json) as MergedPr[];
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(OUT, renderWhatsNew(prs, today));
  console.log(`docs:whats-new: ${prs.length} merged PRs since ${since}; wrote ${path.relative(process.cwd(), OUT)}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
