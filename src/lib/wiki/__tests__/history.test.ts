import { describe, expect, it } from "vitest";

import type { WikiCommit } from "~/lib/localWiki";
import {
  commitAuthorLabel,
  formatCommitDate,
  LIBRARIAN_AUTHOR,
  summarizePaths,
} from "../history";

const NOW = new Date("2026-08-05T12:00:00Z");

function commit(overrides: Partial<WikiCommit> = {}): WikiCommit {
  return {
    sha: "abc1234",
    subject: "File Ada",
    author: LIBRARIAN_AUTHOR,
    date: "2026-08-05T11:00:00Z",
    paths: [],
    ...overrides,
  };
}

describe("formatCommitDate", () => {
  it("is relative for anything inside a week", () => {
    expect(formatCommitDate("2026-08-05T11:59:30Z", NOW)).toBe("just now");
    expect(formatCommitDate("2026-08-05T11:59:00Z", NOW)).toBe("1 minute ago");
    expect(formatCommitDate("2026-08-05T11:40:00Z", NOW)).toBe("20 minutes ago");
    expect(formatCommitDate("2026-08-05T11:00:00Z", NOW)).toBe("1 hour ago");
    expect(formatCommitDate("2026-08-05T04:00:00Z", NOW)).toBe("8 hours ago");
    expect(formatCommitDate("2026-08-04T11:00:00Z", NOW)).toBe("1 day ago");
    expect(formatCommitDate("2026-08-01T12:00:00Z", NOW)).toBe("4 days ago");
  });

  it("becomes an absolute date past a week, where a day count stops meaning anything", () => {
    const formatted = formatCommitDate("2026-06-17T09:30:00Z", NOW);
    expect(formatted).not.toMatch(/ago/);
    expect(formatted).toMatch(/2026/);
  });

  it("reads a commit from the future as just now rather than as a negative age", () => {
    // A pulled repo, or a machine whose clock is wrong. "-3 hours ago" would
    // be worse than approximate.
    expect(formatCommitDate("2026-08-05T18:00:00Z", NOW)).toBe("just now");
  });

  it("gives nothing at all for a timestamp it cannot read", () => {
    // A blank row beats one that says "Invalid Date".
    expect(formatCommitDate("", NOW)).toBe("");
    expect(formatCommitDate("not a date", NOW)).toBe("");
  });

  it("respects the offset git writes, rather than assuming UTC", () => {
    // %aI carries the committer's offset; 13:00+02:00 is 11:00Z, an hour back.
    expect(formatCommitDate("2026-08-05T13:00:00+02:00", NOW)).toBe("1 hour ago");
  });
});

describe("commitAuthorLabel", () => {
  it("says nothing when the app made the commit", () => {
    // Which is nearly every commit, so naming it would be noise on every row.
    expect(commitAuthorLabel(commit())).toBeNull();
  });

  it("names anyone else, because that is the interesting case", () => {
    // The user editing the same folder in their own editor.
    expect(commitAuthorLabel(commit({ author: "James" }))).toBe("James");
  });

  it("treats a blank author as no author", () => {
    expect(commitAuthorLabel(commit({ author: "   " }))).toBeNull();
  });
});

describe("summarizePaths", () => {
  it("titles each path and reports nothing left over when they all fit", () => {
    // The ordinary librarian turn: the page, the index, the log.
    expect(summarizePaths(["people/ada.md", "index.md", "log.md"])).toEqual({
      shown: [
        { path: "people/ada.md", title: "ada" },
        { path: "index.md", title: "index" },
        { path: "log.md", title: "log" },
      ],
      extra: 0,
    });
  });

  it("counts the overflow rather than growing past the subject it belongs to", () => {
    const { shown, extra } = summarizePaths(["a.md", "b.md", "c.md", "d.md", "e.md"]);
    expect(shown).toHaveLength(3);
    expect(extra).toBe(2);
  });

  it("handles a commit with no file list", () => {
    // Per-page history carries no paths — you know which page you asked about.
    expect(summarizePaths([])).toEqual({ shown: [], extra: 0 });
  });
});
