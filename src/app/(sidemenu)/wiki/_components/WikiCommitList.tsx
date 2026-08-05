"use client";

import Link from "next/link";
import { Text } from "@mantine/core";
import { IconGitCommit } from "@tabler/icons-react";

import type { WikiCommit } from "~/lib/localWiki";
import { commitAuthorLabel, formatCommitDate, summarizePaths } from "~/lib/wiki/history";
import { wikiHref } from "~/lib/wiki/wikiLinks";

/**
 * The wiki's git history, as a person reads it.
 *
 * Every writing turn — the librarian's and this app's own editor — lands as one
 * commit, which is most of the reason the wiki is a repo at all. This is where
 * that pays off: it is the single record of what changed, so there is no second
 * activity log to keep in sync with the files.
 *
 * Shows short hashes on purpose. They are what `git show abc1234` and
 * `git revert abc1234` take, and the wiki is a folder the user owns and is
 * expected to open a terminal in.
 */
export function WikiCommitList({
  commits,
  /** Show which pages each commit touched — wanted across the wiki, redundant on one page's own history. */
  showPaths = false,
  emptyMessage,
  now = new Date(),
}: {
  commits: WikiCommit[];
  showPaths?: boolean;
  emptyMessage: string;
  now?: Date;
}) {
  if (commits.length === 0) {
    return (
      <div className="rounded-[10px] border border-border-primary bg-background-secondary px-6 py-10 text-center">
        <Text className="text-sm text-text-secondary">{emptyMessage}</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {commits.map((commit) => {
        const author = commitAuthorLabel(commit);
        const { shown, extra } = summarizePaths(commit.paths);
        return (
          <div
            key={commit.sha}
            className="rounded-[10px] border border-border-primary bg-background-secondary px-[18px] py-3"
          >
            <div className="flex items-baseline gap-2">
              <IconGitCommit
                size={14}
                className="shrink-0 translate-y-0.5 text-text-muted"
                aria-hidden
              />
              <Text className="min-w-0 flex-1 text-[14px] text-text-primary">{commit.subject}</Text>
              <Text className="shrink-0 text-xs text-text-muted">
                {formatCommitDate(commit.date, now)}
              </Text>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[22px]">
              <Text className="font-mono text-xs text-text-muted">{commit.sha}</Text>
              {/* Named only when it wasn't us, which is the case worth noticing. */}
              {author ? <Text className="text-xs text-text-muted">{author}</Text> : null}
              {showPaths
                ? shown.map((page) => (
                    <Link
                      key={page.path}
                      href={wikiHref(page.path)}
                      className="font-mono text-xs text-text-secondary underline decoration-dotted underline-offset-2 transition-colors hover:text-text-primary"
                    >
                      {page.path}
                    </Link>
                  ))
                : null}
              {showPaths && extra > 0 ? (
                <Text className="text-xs text-text-muted">+{extra} more</Text>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
