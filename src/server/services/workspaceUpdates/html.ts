import "server-only";

import { renderPublicPageHtml } from "~/server/services/pages/public-html";
import { markdownToDocServer } from "~/server/services/prd/markdown-doc";

/**
 * An approved update's Markdown as sanitized HTML, for places that cannot run
 * the React renderer (RSS, email): through the shared document schema and the
 * same public sanitization pass as published Pages (ADR-0038), so only
 * schema-known nodes and http(s)/mailto links survive.
 */
export function renderUpdateHtml(markdown: string): string {
  return renderPublicPageHtml(markdownToDocServer(markdown));
}
