/**
 * Maintains the `updated: YYYY-MM-DD` frontmatter field on docs pages (see
 * `src/lib/docs/lastUpdated.ts` for why the date lives in each page).
 *
 *   npx tsx scripts/docs-last-updated.ts --staged
 *     Run by the pre-commit hook. Stamps today's date on every staged docs
 *     page and re-stages it. A page that also has unstaged edits is skipped
 *     with a warning, so `git add -p` never sweeps them into the commit.
 *
 *   npm run docs:last-updated
 *     Fills in pages with no `updated` field (the fix when CI's docs:check
 *     says one is missing), dating each from its last commit, or today when
 *     git has no reliable answer.
 */
import fs from "fs";
import { execFileSync } from "child_process";
import { listDocPages, DOCS_DIR } from "../src/lib/docs/content";
import { gitLastUpdated, setUpdatedFrontmatter } from "../src/lib/docs/lastUpdated";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" });
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stamp(file: string, date: string): boolean {
  const raw = fs.readFileSync(file, "utf-8");
  let next: string;
  try {
    next = setUpdatedFrontmatter(raw, date);
  } catch (error) {
    console.warn(`docs-last-updated: ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  if (next === raw) return false;
  fs.writeFileSync(file, next);
  return true;
}

const pages = listDocPages(DOCS_DIR);

if (process.argv.includes("--staged")) {
  const staged = new Set(
    git(["diff", "--staged", "--name-only", "--diff-filter=ACMR", "--", "content/docs"]).split("\n").filter(Boolean),
  );
  const today = localToday();
  const stamped: string[] = [];
  for (const page of pages) {
    const file = page.filePath;
    if (!staged.has(file)) continue;
    const hasUnstagedEdits = git(["diff", "--name-only", "--", file]).trim() !== "";
    if (hasUnstagedEdits) {
      console.warn(`docs-last-updated: ${file} has unstaged edits; not stamping it (its date stays ${page.meta.updated ?? "unset"})`);
      continue;
    }
    if (stamp(file, today)) stamped.push(file);
  }
  if (stamped.length) git(["add", "--", ...stamped]);
  console.log(`docs-last-updated: stamped ${stamped.length} staged page(s) with ${today}`);
} else {
  let filled = 0;
  for (const page of pages) {
    if (page.meta.updated) continue;
    const date = gitLastUpdated(page.filePath)?.slice(0, 10) ?? localToday();
    if (stamp(page.filePath, date)) filled++;
  }
  console.log(`docs-last-updated: filled ${filled} page(s) missing an updated date`);
}
