import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

import {
  anchorThread,
  carryCommentMarks,
  type CommentAnchorPayload,
  type CommentAnchorResult,
  type CommentQuote,
} from "~/lib/prd/comment-anchor";
import { markdownToDocServer } from "~/server/services/prd/markdown-doc";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

/**
 * Server-side pinning of a new comment thread to its document (ADR-0024). The
 * comment routers call {@link anchorThreadInStoredDoc} right after creating a
 * thread's root comment, so the highlight lands in the stored doc in the same
 * request — instead of depending on the editor's next autosave, which a
 * concurrent Markdown rewrite turns into a CONFLICT that loses the mark.
 *
 * Host-agnostic: each router supplies how to read its doc + `docVersion` and
 * how to compare-and-set it (Feature.descriptionDoc, Ticket.bodyDoc,
 * KnowledgePage.bodyDoc).
 */

/** Wire shape of {@link CommentAnchorPayload}. */
export const commentAnchorInput = z.object({
  baseVersion: z.number().int().min(0),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  prefix: z.string().max(200).optional(),
  suffix: z.string().max(200).optional(),
}) satisfies z.ZodType<CommentAnchorPayload>;

export type { CommentAnchorResult, CommentQuote };

export const NOT_ANCHORED: CommentAnchorResult = { anchored: false, fastForward: false };

interface StoredDocAccess {
  read: () => Promise<{ doc: JSONContent | null; docVersion: number } | null>;
  /** Compare-and-set on `docVersion`; true when the write landed. */
  write: (doc: JSONContent, expectedVersion: number) => Promise<boolean>;
}

/**
 * Add `threadId`'s mark to the stored doc. Never throws: the comment row
 * already exists, so a failure here only leaves the thread orphaned (the
 * pre-fix behaviour) and is reported rather than surfaced.
 */
export async function anchorThreadInStoredDoc(
  args: StoredDocAccess & {
    threadId: string;
    quotedText: string | undefined;
    anchor: CommentAnchorPayload | undefined;
    /** For error reports, e.g. "featureComment.create". */
    area: string;
  },
): Promise<CommentAnchorResult> {
  const { threadId, quotedText, anchor, read, write, area } = args;
  if (!anchor || !quotedText?.trim()) return NOT_ANCHORED;
  const quote = { exact: quotedText, prefix: anchor.prefix, suffix: anchor.suffix };
  try {
    // One retry: losing the compare-and-set means another write landed
    // between our read and write, so re-read and re-anchor against it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const stored = await read();
      // No doc yet (lazy migration pending): nothing to pin to server-side;
      // the client's own mark + save still covers this case.
      if (!stored?.doc) return NOT_ANCHORED;
      const fastForward = stored.docVersion === anchor.baseVersion;
      const next = anchorThread(
        stored.doc,
        threadId,
        quote,
        fastForward ? { from: anchor.from, to: anchor.to } : undefined,
      );
      if (!next) return NOT_ANCHORED;
      if (await write(next, stored.docVersion)) {
        return { anchored: true, docVersion: stored.docVersion + 1, fastForward };
      }
    }
  } catch (error) {
    reportHandledErrorServer(error, { area, context: { threadId } });
  }
  return NOT_ANCHORED;
}

/**
 * The doc to store for a Markdown-only write: `derived` (re-derived from the
 * Markdown) with the previous doc's comment marks carried across, so a
 * CLI/agent rewrite doesn't orphan every thread whose text survived it. Falls
 * back to the bare derived doc if carrying fails — the pre-fix behaviour.
 */
export function withCarriedCommentMarks(
  previous: JSONContent | null | undefined,
  derived: JSONContent,
  area: string,
): JSONContent {
  try {
    return carryCommentMarks(previous, derived).doc;
  } catch (error) {
    reportHandledErrorServer(error, { area });
    return derived;
  }
}

/**
 * Why {@link anchorThreadByQuote} refused: the quote isn't in the body (or is
 * there more than once with nothing to pick between them), or the body kept
 * changing under both attempts.
 */
export type QuoteAnchorOutcome =
  | { status: "anchored"; docVersion: number }
  | { status: "not_found" }
  | { status: "conflict" };

/**
 * The stored doc with `threadId`'s mark on the span `quote` names. A host whose
 * doc was never derived (`doc` null: a Markdown-only page written through the
 * API) gets it derived from `markdown` here — the same conversion the editor's
 * lazy migration runs on first open — so the mark has somewhere to live.
 * `null` when the quote doesn't resolve to exactly one span.
 */
export function docWithQuotedThread(
  stored: { doc: JSONContent | null; markdown: string | null },
  threadId: string,
  quote: CommentQuote,
): JSONContent | null {
  if (!quote.exact.trim()) return null;
  const doc =
    stored.doc ??
    (stored.markdown?.trim() ? markdownToDocServer(stored.markdown) : null);
  return doc ? anchorThread(doc, threadId, quote) : null;
}

/**
 * Pin a new thread by its quote alone — the path for agents and the CLI, which
 * have no editor selection to send positions for. Unlike
 * {@link anchorThreadInStoredDoc} this runs *before* the thread exists and
 * reports failure, so a caller can refuse to post a thread whose quote went
 * nowhere instead of leaving it orphaned. `write` should create the thread's
 * root comment in the same transaction as the doc, so the two land together.
 */
export async function anchorThreadByQuote(args: {
  threadId: string;
  quote: CommentQuote;
  read: () => Promise<{ doc: JSONContent | null; markdown: string | null; docVersion: number } | null>;
  write: (doc: JSONContent, expectedVersion: number) => Promise<boolean>;
}): Promise<QuoteAnchorOutcome> {
  const { threadId, quote, read, write } = args;
  // One retry, as in anchorThreadInStoredDoc: a lost compare-and-set means
  // another write landed in between, so re-read and re-find the quote.
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = await read();
    if (!stored) return { status: "not_found" };
    const next = docWithQuotedThread(stored, threadId, quote);
    if (!next) return { status: "not_found" };
    if (await write(next, stored.docVersion)) {
      return { status: "anchored", docVersion: stored.docVersion + 1 };
    }
  }
  return { status: "conflict" };
}
