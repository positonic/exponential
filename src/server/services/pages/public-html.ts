import "server-only";

import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";

import { buildPrdExtensions } from "~/lib/prd/extensions";
import { sanitizeDocForPublic } from "~/lib/pages/public-doc";

/**
 * Render a Page's canonical ProseMirror `bodyDoc` to static HTML for the
 * unauthenticated `/p/[slugId]` route (ADR-0038). Runs the public sanitization
 * pass first, then serializes through the same shared extension schema the
 * editor uses, so the public render and the editor agree on every node type.
 */
export function renderPublicPageHtml(bodyDoc: JSONContent): string {
  return generateHTML(sanitizeDocForPublic(bodyDoc), buildPrdExtensions());
}
