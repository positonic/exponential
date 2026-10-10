/**
 * Presenting the wiki's git history.
 *
 * The shell hands back raw `git log` records — an ISO-8601 timestamp, a
 * subject, an author, the paths a commit touched. Everything here turns those
 * into what a person reads, and it is all pure so it can be tested without a
 * repo, a shell, or a clock.
 */
import type { WikiCommit } from "~/lib/localWiki";
import { pageTitle } from "./wikiLinks";

/** Who the shell commits as when the librarian (or the page editor) writes. */
export const LIBRARIAN_AUTHOR = "Exponential librarian";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago a commit landed, in the register a history list wants.
 *
 * Relative up to a week — "3 hours ago" is what you actually want to know
 * about something the librarian just filed — then absolute, because "43 days
 * ago" is a number nobody converts back into a date. `now` is a parameter
 * rather than a `Date.now()` call so this stays a pure function.
 *
 * A timestamp git couldn't produce, or one we failed to parse, comes back as
 * the empty string: a row with no date beats a row saying "Invalid Date".
 */
export function formatCommitDate(iso: string, now: Date): string {
  const when = new Date(iso);
  const time = when.getTime();
  if (Number.isNaN(time)) return "";

  const elapsed = now.getTime() - time;
  // A clock that disagrees with the commit's — a pulled repo, a machine whose
  // time was wrong — should read as "just now", never as a negative age.
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return when.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Who to credit, or null when it was us.
 *
 * Every commit the app makes carries the librarian's identity, so naming it on
 * each row would be noise on almost every row. A commit by anybody else — the
 * user, from their own editor, in the same folder — is the interesting case and
 * is the one that gets named.
 */
export function commitAuthorLabel(commit: WikiCommit): string | null {
  const author = commit.author.trim();
  if (!author || author === LIBRARIAN_AUTHOR) return null;
  return author;
}

/**
 * The pages a commit touched, as titles, with an overflow count.
 *
 * A librarian turn routinely writes the page, `index.md` and `log.md`, so
 * three is the ordinary case and worth showing in full; beyond that the list
 * would take more room than the subject it belongs to.
 */
export function summarizePaths(
  paths: string[],
  limit = 3,
): { shown: { path: string; title: string }[]; extra: number } {
  const shown = paths.slice(0, limit).map((path) => ({ path, title: pageTitle(path) }));
  return { shown, extra: Math.max(0, paths.length - shown.length) };
}
