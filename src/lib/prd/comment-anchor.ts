import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { buildPrdExtensions } from "./extensions";

/**
 * Server-side anchoring of comment threads (ADR-0024). A thread's highlight is
 * a `comment` mark in the stored document. Relying on the editor's autosave to
 * persist that mark loses it whenever the save is rejected — most often a
 * docVersion CONFLICT after a CLI/agent rewrote the Markdown while the tab was
 * open — leaving the thread orphaned. So the server writes the mark itself:
 *
 *  - {@link anchorThread} pins a new thread to the stored doc, at the client's
 *    positions when the doc is the one the client saw, else by finding its
 *    quote (a W3C-style text-quote selector: exact text plus a little context).
 *  - {@link carryCommentMarks} re-applies every thread's mark to a document
 *    re-derived from Markdown, which never carries them.
 *
 * Pure and DOM-free (schema + Transform only), so it runs on client and server.
 */

/** The selected text plus the text around it, to pick between repeats. */
export interface CommentQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
}

/**
 * What the client sends with a new thread's first comment: where it saw the
 * selection. `from`/`to` are trusted only while the stored doc is still at
 * `baseVersion`; otherwise the thread's `quotedText` plus this context finds it.
 */
export interface CommentAnchorPayload {
  baseVersion: number;
  from: number;
  to: number;
  prefix?: string;
  suffix?: string;
}

/** What the server reports back after trying to pin the thread. */
export interface CommentAnchorResult {
  /** The stored doc now carries the thread's `comment` mark. */
  anchored: boolean;
  /** The doc's version after the write (set when `anchored`). */
  docVersion?: number;
  /**
   * The write was made on top of exactly the version the client was editing,
   * so the client may adopt `docVersion` as its new base. False means someone
   * else changed the doc first; the client keeps its base and its next save
   * conflicts, as it should.
   */
  fastForward: boolean;
}

/** Characters of context kept on each side of a quote. */
const CONTEXT_CHARS = 32;
/** Mirrors the client's quote snapshot cap (useAnchoredComments). */
export const QUOTE_MAX_CHARS = 1000;

let schemaCache: Schema | null = null;
function prdSchema(): Schema {
  schemaCache ??= getSchema(buildPrdExtensions());
  return schemaCache;
}

/**
 * The document's text as one string, built with the same rules as
 * `doc.textBetween(0, size, " ")` — the call that produced every stored
 * `quotedText` — so a quote is a substring of it. `units[i]` is the document
 * range character `i` came from; `null` for a block separator.
 */
interface TextIndex {
  text: string;
  units: ({ from: number; to: number } | null)[];
  /** Character index where each text node starts, keyed by its position. */
  textNodeStart: Map<number, number>;
}

function indexDoc(doc: PMNode): TextIndex {
  let text = "";
  const units: TextIndex["units"] = [];
  const textNodeStart = new Map<number, number>();
  let first = true;
  doc.descendants((node, pos) => {
    const leafText = node.type.spec.leafText as ((n: PMNode) => string) | undefined;
    const nodeText = node.isText
      ? (node.text ?? "")
      : node.isLeaf && leafText
        ? leafText(node)
        : "";
    if (node.isBlock && ((node.isLeaf && nodeText) || node.isTextblock)) {
      if (first) first = false;
      else {
        text += " ";
        units.push(null);
      }
    }
    if (node.isText) {
      textNodeStart.set(pos, text.length);
      for (let i = 0; i < nodeText.length; i++) units.push({ from: pos + i, to: pos + i + 1 });
    } else {
      // An inline leaf's text all maps to the leaf itself. One unit per UTF-16
      // code unit (not per code point), to stay aligned with `text`.
      units.push(
        ...Array.from({ length: nodeText.length }, () => ({ from: pos, to: pos + node.nodeSize })),
      );
    }
    text += nodeText;
    return true;
  });
  return { text, units, textNodeStart };
}

/** Document range covered by characters `start..end` of the index. */
function rangeOf(index: TextIndex, start: number, end: number): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;
  for (const unit of index.units.slice(start, end)) {
    if (!unit) continue;
    from ??= unit.from;
    to = unit.to;
  }
  return from != null && to != null && from < to ? { from, to } : null;
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Where `quote` sits in the indexed text: the occurrence whose surroundings
 *  best match its context, the first one on a tie. */
function findQuote(index: TextIndex, quote: CommentQuote): { from: number; to: number } | null {
  const { exact } = quote;
  if (!exact.trim()) return null;
  let best: { start: number; score: number } | null = null;
  for (let i = index.text.indexOf(exact); i !== -1; i = index.text.indexOf(exact, i + 1)) {
    const before = index.text.slice(0, i);
    const after = index.text.slice(i + exact.length);
    const score =
      commonSuffixLength(before, quote.prefix ?? "") +
      commonPrefixLength(after, quote.suffix ?? "");
    if (!best || score > best.score) best = { start: i, score };
  }
  return best ? rangeOf(index, best.start, best.start + exact.length) : null;
}

/** The quote for `from..to`, as the client snapshots it, plus context. */
export function quoteAt(doc: PMNode, from: number, to: number): CommentQuote {
  const index = indexDoc(doc);
  let start = -1;
  let end = -1;
  index.units.forEach((unit, i) => {
    if (!unit || unit.to <= from || unit.from >= to) return;
    if (start === -1) start = i;
    end = i + 1;
  });
  if (start === -1) return { exact: "" };
  return {
    exact: doc.textBetween(from, to, " ").slice(0, QUOTE_MAX_CHARS),
    prefix: index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: index.text.slice(end, end + CONTEXT_CHARS),
  };
}

/** The anchor payload for a selection the client is about to comment on. */
export function anchorPayload(
  doc: PMNode,
  from: number,
  to: number,
  baseVersion: number,
): CommentAnchorPayload {
  const { prefix, suffix } = quoteAt(doc, from, to);
  return { baseVersion, from, to, prefix, suffix };
}

function hasThreadMark(doc: PMNode, threadId: string): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.marks.some((m) => m.type.name === "comment" && m.attrs.threadId === threadId)) {
      found = true;
    }
    return !found;
  });
  return found;
}

/**
 * Add `threadId`'s `comment` mark to `docJson`. Uses `hint` when it still
 * selects the quoted text (the doc is unchanged since the client saw it), else
 * finds the quote. Returns the new document, or `null` when there is nothing to
 * do — the thread is already marked — or nowhere to put it (the quoted text is
 * gone; the thread stays orphaned).
 */
export function anchorThread(
  docJson: JSONContent,
  threadId: string,
  quote: CommentQuote,
  hint?: { from: number; to: number },
): JSONContent | null {
  const schema = prdSchema();
  const markType = schema.marks.comment;
  if (!markType) return null;
  const doc = PMNode.fromJSON(schema, docJson);
  if (hasThreadMark(doc, threadId)) return null;

  const hintValid =
    hint != null &&
    hint.from >= 0 &&
    hint.from < hint.to &&
    hint.to <= doc.content.size &&
    doc.textBetween(hint.from, hint.to, " ").slice(0, QUOTE_MAX_CHARS) === quote.exact;
  const range = hintValid ? hint : findQuote(indexDoc(doc), quote);
  if (!range) return null;

  return new Transform(doc)
    .addMark(range.from, range.to, markType.create({ threadId }))
    .doc.toJSON() as JSONContent;
}

/**
 * Re-apply the `comment` marks of `fromJson` to `toJson` — a document
 * re-derived from Markdown, which carries no marks. Each marked run of text is
 * found again by its quote and context; a run whose text no longer exists is
 * dropped, and its thread becomes orphaned exactly as an editor deletion would.
 */
export function carryCommentMarks(
  fromJson: JSONContent | null | undefined,
  toJson: JSONContent,
): { doc: JSONContent; carried: string[]; dropped: string[] } {
  const schema = prdSchema();
  const markType = schema.marks.comment;
  if (!fromJson || !markType) return { doc: toJson, carried: [], dropped: [] };
  const from = PMNode.fromJSON(schema, fromJson);
  const fromIndex = indexDoc(from);

  // Contiguous marked runs per thread, as character ranges of the old text.
  const runs: { threadId: string; start: number; end: number }[] = [];
  const open = new Map<string, { start: number; end: number; nextPos: number }>();
  from.descendants((node, pos) => {
    if (!node.isText) return true;
    const start = fromIndex.textNodeStart.get(pos);
    if (start == null) return false;
    const end = start + (node.text?.length ?? 0);
    const ids = new Set(
      node.marks
        .filter((m) => m.type === markType)
        .map((m) => m.attrs.threadId as unknown)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    );
    for (const [threadId, run] of open) {
      if (ids.has(threadId) && run.nextPos === pos) {
        run.end = end;
        run.nextPos = pos + node.nodeSize;
        ids.delete(threadId);
      } else {
        runs.push({ threadId, start: run.start, end: run.end });
        open.delete(threadId);
      }
    }
    for (const threadId of ids) open.set(threadId, { start, end, nextPos: pos + node.nodeSize });
    return false;
  });
  for (const [threadId, run] of open) runs.push({ threadId, start: run.start, end: run.end });
  if (runs.length === 0) return { doc: toJson, carried: [], dropped: [] };

  // Marks don't move text, so one index of the target serves every run.
  const target = PMNode.fromJSON(schema, toJson);
  const targetIndex = indexDoc(target);
  const tr = new Transform(target);
  const carried = new Set<string>();
  const attempted = new Set<string>();
  for (const run of runs) {
    attempted.add(run.threadId);
    const range = findQuote(targetIndex, {
      exact: fromIndex.text.slice(run.start, run.end),
      prefix: fromIndex.text.slice(Math.max(0, run.start - CONTEXT_CHARS), run.start),
      suffix: fromIndex.text.slice(run.end, run.end + CONTEXT_CHARS),
    });
    if (!range) continue;
    tr.addMark(range.from, range.to, markType.create({ threadId: run.threadId }));
    carried.add(run.threadId);
  }
  return {
    doc: tr.doc.toJSON() as JSONContent,
    carried: [...carried],
    dropped: [...attempted].filter((id) => !carried.has(id)),
  };
}

/** True when the document holds at least one `comment` mark. */
export function docHasCommentMarks(docJson: JSONContent | null | undefined): boolean {
  if (!docJson) return false;
  const walk = (node: JSONContent): boolean =>
    (node.marks ?? []).some((m) => m.type === "comment") ||
    (node.content ?? []).some(walk);
  return walk(docJson);
}
