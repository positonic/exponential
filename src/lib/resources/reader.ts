import { youtubeVideoId } from '~/utils/youtube';

/**
 * How a saved Resource opens, in one place so the Knowledge page and the reader
 * agree. The rule, for every link type and on every client: **the title opens
 * Exponential's reader; a separate link goes to the original.** The iOS Read
 * tab follows the same rule (`ReaderDocument`, `ReadingListView`).
 */

/**
 * A saved YouTube link is summarised on the server after the save returns,
 * usually within a minute. Until then the UI says so and polls; past this
 * window the cron sweep owns it and the UI stops waiting.
 */
export const SUMMARY_PENDING_MS = 90_000;
export const SUMMARY_POLL_MS = 4_000;

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
  contentType: string;
}

export interface ReaderContent {
  summary: string | null;
  /** The full text. `content` is Markdown; a row with only `rawContent` has article HTML. */
  body: string | null;
  /** The disclosure's label: a summary leads, so the full text folds away under it. */
  bodyLabel: string;
  /** Nothing to read in-app: only the link was saved. */
  isEmpty: boolean;
}

function nonBlank(text: string | null): string | null {
  return text?.trim() ? text : null;
}

export function readerContent(resource: ReaderContentFields): ReaderContent {
  const summary = nonBlank(resource.summary);
  const body = nonBlank(resource.content) ?? nonBlank(resource.rawContent);
  return {
    summary,
    body,
    bodyLabel: resource.contentType === 'video' ? 'Transcript' : 'Full article',
    isEmpty: !summary && !body,
  };
}
