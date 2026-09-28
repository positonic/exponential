/**
 * Regenerates `content/docs/_last-updated.json`: one ISO date per docs page,
 * from the last commit that touched it. Pages that are currently staged or
 * modified get today's date, since their commit does not exist yet.
 *
 * Run by the pre-commit hook when a docs page is staged, and by
 * `npm run docs:last-updated`. Committed so that shallow clones on the build
 * machine (which cannot see old history) still show a date.
 */
import fs from "fs";
import { execFileSync } from "child_process";
import { listDocPages, DOCS_DIR } from "../src/lib/docs/content";
import { gitLastUpdated, LAST_UPDATED_FILE, readLastUpdatedMap } from "../src/lib/docs/lastUpdated";

function changedFiles(): Set<string> {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--", "content/docs"], { encoding: "utf-8" });
    return new Set(
      out
        .split("\n")
        .filter(Boolean)
        .map((l) => l.slice(3).trim().replace(/^"|"$/g, "")),
    );
  } catch {
    return new Set();
  }
}

const previous = readLastUpdatedMap();
const changed = changedFiles();
const today = new Date().toISOString().slice(0, 10);
const next: Record<string, string> = {};

for (const page of listDocPages(DOCS_DIR)) {
  const file = page.filePath;
  const fromGit = gitLastUpdated(file)?.slice(0, 10) ?? null;
  next[file] = changed.has(file) ? today : (fromGit ?? previous[file] ?? today);
}

const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(LAST_UPDATED_FILE, JSON.stringify(sorted, null, 2) + "\n");
console.log(`docs-last-updated: wrote ${Object.keys(sorted).length} entries to ${LAST_UPDATED_FILE}`);
