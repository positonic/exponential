import { youtubeVideoId } from '~/utils/youtube';

/**
 * How a saved Resource opens, in one place so the Knowledge page and the reader
 * agree. The rule, for every link type and on every client: **the title opens
 * Exponential's reader; a separate link goes to the original.** The iOS Read
 * tab follows the same rule (`ReaderDocument`, `ReadingListView`).
 */

/**
 * A saved YouTube link gets its article on the server after the save returns,
 * which can take minutes. Until then the UI says so and polls; past this window
 * (the job's own limit) the cron sweep owns it and the UI stops waiting.
 */
export const SUMMARY_PENDING_MS = 300_000;
export const SUMMARY_POLL_MS = 10_000;

/** How a Resource's `content` is marked as Markdown. */
export const ARTICLE_MIME_TYPE = 'text/markdown';

/**
 * A video written up as an article: `content` is the article, `rawContent` the
 * transcript and `summary` the article's opening. A video summarised before
 * 2026-11-07 has a short `summary` and its transcript in `content` until it's
 * saved again.
 */
export function isVideoArticle(resource: { contentType: string; mimeType: string | null }): boolean {
  return resource.contentType === 'video' && resource.mimeType === ARTICLE_MIME_TYPE;
}

export interface SummaryFields {
  url: string | null;
  summary: string | null;
  createdAt: Date | string;
}

export function isSummaryPending(resource: SummaryFields, now: number = Date.now()): boolean {
  return (
    !resource.summary &&
    youtubeVideoId(resource.url) !== null &&
    now - new Date(resource.createdAt).getTime() < SUMMARY_PENDING_MS
  );
}

/**
 * Whether a list should keep polling. Named rather than `some(isSummaryPending)`:
 * `some` passes the array index second, which would land in `now` and make
 * every unsummarised video look brand new, so the list would never stop.
 */
export function anySummaryPending(resources: SummaryFields[], now: number = Date.now()): boolean {
  return resources.some((resource) => isSummaryPending(resource, now));
}

/** The reader's address. A row with no workspace still opens inside the current one. */
export function resourceReaderHref(id: string, workspaceSlug?: string | null): string {
  return workspaceSlug ? `/w/${workspaceSlug}/knowledge-base/${id}` : `/knowledge-base/${id}`;
}

/** The address of the Knowledge page the reader came from. */
export function knowledgeHref(workspaceSlug?: string | null): string {
  return workspaceSlug ? `/w/${workspaceSlug}/knowledge-base` : '/knowledge-base';
}

/**
 * The URL to link to, or null when it isn't a web address. `resource.create`
 * accepts any URL, and an agent can save one, so `javascript:` must not reach
 * an href.
 */
export function safeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** What the link to the original says. */
export function sourceLinkLabel(url: string | null | undefined): string {
  return youtubeVideoId(url) ? 'Watch on YouTube' : 'Open original';
}

export interface ReaderContentFields {
  summary: string | null;
  content: string | null;
  rawContent: string | null;
  description: string | null;
  contentType: string;
  mimeType: string | null;
}

export interface ReaderContent {
  summary: string | null;
  /** The full text. `content` is Markdown; a row with only `rawContent` has article HTML. */
  body: string | null;
  /**
   * How to read `body`. Saved as Markdown, a literal tag in it (a code example)
   * must not read as HTML; anything else may be legacy or captured HTML, which
   * `MarkdownRenderer` detects and passes through DOMPurify. See
   * `reader.render.test.tsx`.
   */
  bodyFormat: 'markdown' | 'auto';
  /** The disclosure's label: a summary leads, so the full text folds away under it. */
  bodyLabel: string;
  /** A video article's transcript, offered below the article. */
  transcript: string | null;
  /** Nothing to read in-app: only the link was saved. */
  isEmpty: boolean;
}

function nonBlank(text: string | null): string | null {
  return text?.trim() ? text : null;
}

export function readerContent(resource: ReaderContentFields): ReaderContent {
  const summary = nonBlank(resource.summary);
  const content = nonBlank(resource.content);
  const body = content ?? nonBlank(resource.rawContent) ?? nonBlank(resource.description);
  if (isVideoArticle(resource) && content) {
    // The article opens with its own standfirst, which is what `summary` holds.
    return {
      summary: null,
      body: content,
      bodyFormat: 'markdown',
      bodyLabel: 'Article',
      transcript: nonBlank(resource.rawContent),
      isEmpty: false,
    };
  }
  return {
    summary,
    body,
    bodyFormat: content && resource.mimeType === ARTICLE_MIME_TYPE ? 'markdown' : 'auto',
    bodyLabel: resource.contentType === 'video' ? 'Transcript' : 'Full article',
    transcript: null,
    isEmpty: !summary && !body,
  };
}
