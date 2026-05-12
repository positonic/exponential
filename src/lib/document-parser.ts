/**
 * Extract plain text from document buffers for embedding.
 *
 * Supported MIME types (Phase 3c scope):
 *   - application/pdf                                                    -> pdf-parse
 *   - application/vnd.openxmlformats-officedocument.wordprocessingml.document (docx) -> mammoth
 *   - text/plain                                                         -> utf-8 decode
 *   - text/markdown                                                      -> utf-8 decode
 *   - text/csv                                                           -> utf-8 decode
 *   - text/html                                                          -> cheerio (strip tags)
 *
 * Image OCR (PNG/JPG) is intentionally NOT handled here — it's a follow-up PR.
 */

import mammoth from "mammoth";
import * as cheerio from "cheerio";

// pdf-parse is loaded lazily inside extractText(). It cannot be imported at
// module scope: pdf-parse@2.x is PDF.js-based and references browser globals
// (DOMMatrix, @napi-rs/canvas) during module evaluation. On Vercel's Node
// runtime DOMMatrix is undefined, so a top-level import crashes the entire
// tRPC route handler at function init — which previously took the whole
// /api/trpc/* surface down. Importing inside the PDF branch defers that work
// to the only request path that actually parses a PDF.

const SUPPORTED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
] as const;

export interface ExtractTextResult {
  text: string;
  meta: {
    pageCount?: number;
    wordCount: number;
  };
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Extract plain text from a document buffer based on its MIME type.
 * Throws a descriptive error for unsupported MIME types.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<ExtractTextResult> {
  // Normalise: drop charset/parameter suffixes (e.g. "text/plain; charset=utf-8")
  const normalisedMime = mimeType.split(";")[0]!.trim().toLowerCase();

  if (normalisedMime === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        text: result.text,
        meta: { pageCount: result.total, wordCount: countWords(result.text) },
      };
    } finally {
      await parser.destroy();
    }
  }

  if (
    normalisedMime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      meta: { wordCount: countWords(result.value) },
    };
  }

  if (
    normalisedMime === "text/plain" ||
    normalisedMime === "text/markdown" ||
    normalisedMime === "text/csv"
  ) {
    const text = buffer.toString("utf-8");
    return { text, meta: { wordCount: countWords(text) } };
  }

  if (normalisedMime === "text/html") {
    const html = buffer.toString("utf-8");
    const $ = cheerio.load(html);
    // Strip non-content elements before extracting text.
    $("script, style, nav, footer, header, aside, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    return { text, meta: { wordCount: countWords(text) } };
  }

  throw new Error(
    `Unsupported MIME type "${mimeType}"${filename ? ` (file: ${filename})` : ""}. ` +
      `Supported types: ${SUPPORTED_MIMES.join(", ")}`,
  );
}
