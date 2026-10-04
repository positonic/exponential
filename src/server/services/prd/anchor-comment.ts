import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

import {
  anchorThread,
  carryCommentMarks,
  type CommentAnchorPayload,
  type CommentAnchorResult,
} from "~/lib/prd/comment-anchor";
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

export type { CommentAnchorResult };

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
