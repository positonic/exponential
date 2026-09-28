/**
 * "Last updated" dates for docs pages.
 *
 * Source of truth is git, but the build machine's clone is usually shallow
 * (Vercel fetches ~10 commits), and in a shallow clone `git log -1 -- file`
 * reports the shallow boundary commit for any file older than the fetch
 * depth — a wrong, too-recent date. So:
 *
 *   1. Each page carries an `updated: YYYY-MM-DD` frontmatter field, stamped
 *      by the pre-commit hook whenever the page is staged
 *      (`scripts/docs-last-updated.ts`). It lives in the page itself rather
 *      than a shared map so that docs PRs touching different pages never
 *      conflict with each other.
 *   2. At render time we still ask git, and prefer its answer only when the
 *      commit it names is not a shallow boundary (it catches edits made
 *      without the hook, e.g. from the GitHub web editor).
 *
 * Both pieces are tolerant: no git or no `updated` field simply yields `null`
 * and the page renders without a date.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import matter from "gray-matter";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalises a frontmatter `updated` value to `YYYY-MM-DD`, or null when it
 * is absent or malformed. YAML parses an unquoted `2026-09-28` as a Date, so
 * both shapes are accepted.
 */
export function parseUpdatedField(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === "string" && DATE_ONLY.test(value.trim())) return value.trim();
  return null;
}

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[^\S\r\n]*(\r?\n|$)/;
const UPDATED_LINE = /^updated:.*$/m;

/**
 * Returns `raw` with its frontmatter `updated` field set to `date`, editing
 * the YAML as text so every other line keeps its exact formatting. Adds a
 * frontmatter block when the page has none.
 */
export function setUpdatedFrontmatter(raw: string, date: string): string {
  const match = FRONTMATTER.exec(raw);
  if (!match) return `---\nupdated: ${date}\n---\n\n${raw}`;
  const yaml = match[1] ?? "";
  const nextYaml = UPDATED_LINE.test(yaml)
    ? yaml.replace(UPDATED_LINE, `updated: ${date}`)
    : `${yaml}${yaml.length ? "\n" : ""}updated: ${date}`;
  return `---\n${nextYaml}\n---${match[2] ?? ""}${raw.slice(match[0].length)}`;
}

/** The `updated` frontmatter date of a docs page, or null. */
export function readFrontmatterUpdated(filePath: string): string | null {
  try {
    const { data } = matter(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8"));
    return parseUpdatedField(data.updated);
  } catch {
    return null;
  }
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

let shallowBoundary: Set<string> | null = null;

function shallowCommits(): Set<string> {
  if (shallowBoundary) return shallowBoundary;
  shallowBoundary = new Set();
  const gitDir = git(["rev-parse", "--git-dir"]);
  if (gitDir) {
    try {
      const shallowFile = path.resolve(process.cwd(), gitDir, "shallow");
      for (const line of fs.readFileSync(shallowFile, "utf-8").split("\n")) {
        if (line.trim()) shallowBoundary.add(line.trim());
      }
    } catch {
      // Not a shallow clone.
    }
  }
  return shallowBoundary;
}

/** Commit date of the last commit touching `filePath`, or null when git cannot say reliably. */
export function gitLastUpdated(filePath: string): string | null {
  const out = git(["log", "-1", "--format=%H %cI", "--", filePath]);
  if (!out) return null;
  const [sha, date] = out.split(" ");
  if (!sha || !date) return null;
  if (shallowCommits().has(sha)) return null;
  return date;
}

/**
 * Best available date for a page: the later of git (when trustworthy) and
 * the page's `updated` frontmatter. Returns an ISO string or null.
 */
export function getLastUpdated(filePath: string, fromFrontmatter: string | null = readFrontmatterUpdated(filePath)): string | null {
  const fromGit = gitLastUpdated(filePath);
  if (fromGit && fromFrontmatter) return fromGit > fromFrontmatter ? fromGit : fromFrontmatter;
  return fromGit ?? fromFrontmatter;
}
