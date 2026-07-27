/**
 * Shared, pure conventional-commit categorization — the single source of truth
 * for grouping commits by change type, used by both the public **product-timeline**
 * and the **"What Shipped Today"** Broadcast's digest step (CONTEXT.md → Broadcast).
 *
 * No React, no server deps, no `Date.now()` — so it is trivially unit-testable
 * and importable from a client component and a workflow step alike.
 *
 * Two distinct read shapes deliberately coexist:
 * - `parseCommitMessage` / `summarizeByCategory` preserve the timeline's exact
 *   current behaviour (every commit counted, merges fall through to "update").
 * - `groupUserFacingForDigest` is the digest view: merges + non-user-facing
 *   noise (chore/ci/build/style/test/refactor) are dropped.
 */

export type CommitCategory =
  | "feat"
  | "fix"
  | "perf"
  | "docs"
  | "refactor"
  | "style"
  | "test"
  | "chore"
  | "ci"
  | "build"
  | "update";

export interface CategoryMeta {
  label: string;
  /** Mantine color token (string only — icons live in the client component). */
  color: string;
  /** Whether this category is surfaced in the user-facing digest. */
  userFacing: boolean;
}

export const COMMIT_CATEGORIES: Record<CommitCategory, CategoryMeta> = {
  feat: { label: "Feature", color: "blue", userFacing: true },
  fix: { label: "Fix", color: "green", userFacing: true },
  perf: { label: "Perf", color: "orange", userFacing: true },
  docs: { label: "Docs", color: "cyan", userFacing: true },
  refactor: { label: "Refactor", color: "violet", userFacing: false },
  style: { label: "Style", color: "pink", userFacing: false },
  test: { label: "Test", color: "yellow", userFacing: false },
  chore: { label: "Chore", color: "gray", userFacing: false },
  ci: { label: "CI", color: "gray", userFacing: false },
  build: { label: "Build", color: "gray", userFacing: false },
  update: { label: "Update", color: "gray", userFacing: false },
};

/** Display order for digest sections (most user-relevant first). */
const DIGEST_ORDER: CommitCategory[] = ["feat", "fix", "perf", "docs"];

const CONVENTIONAL_RE =
  /^(feat|fix|chore|docs|refactor|style|test|perf|ci|build)(?:\(.+?\))?:\s*(.+)/i;

/**
 * Parse a conventional-commit subject into its category + clean text.
 * A non-conventional message falls through to the "update" category with the
 * message verbatim — identical to the timeline's prior behaviour.
 */
export function parseCommitMessage(message: string): {
  category: CommitCategory;
  text: string;
} {
  const match = message.match(CONVENTIONAL_RE);
  if (match) {
    return {
      category: match[1]!.toLowerCase() as CommitCategory,
      text: match[2]!,
    };
  }
  return { category: "update", text: message };
}

export function isMergeCommit(message: string): boolean {
  return /^Merge (pull request|branch|remote-tracking|commit)/i.test(
    message.trimStart(),
  );
}

/** Category counts across all commits, descending — the timeline badge summary. */
export function summarizeByCategory(
  commits: { message: string }[],
): { category: CommitCategory; count: number }[] {
  const counts = new Map<CommitCategory, number>();
  for (const commit of commits) {
    const { category } = parseCommitMessage(commit.message);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export interface DigestSection<T> {
  category: CommitCategory;
  meta: CategoryMeta;
  items: { commit: T; text: string }[];
}

/**
 * The digest view: drop merge commits and non-user-facing categories, then
 * group the rest by category in `DIGEST_ORDER`. Returns only non-empty sections,
 * so a window with no user-facing changes yields an empty array (the caller
 * treats that as "nothing shipped — skip the send").
 */
export function groupUserFacingForDigest<T extends { message: string }>(
  commits: T[],
): DigestSection<T>[] {
  const byCategory = new Map<CommitCategory, { commit: T; text: string }[]>();

  for (const commit of commits) {
    if (isMergeCommit(commit.message)) continue;
    const { category, text } = parseCommitMessage(commit.message);
    if (!COMMIT_CATEGORIES[category].userFacing) continue;
    const bucket = byCategory.get(category) ?? [];
    bucket.push({ commit, text });
    byCategory.set(category, bucket);
  }

  return DIGEST_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
    category,
    meta: COMMIT_CATEGORIES[category],
    items: byCategory.get(category)!,
  }));
}
