import { NextResponse } from "next/server";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildLlmsFull } from "~/lib/docs/llmsText";

export const dynamic = "force-dynamic";

/**
 * GET /llms-full.txt — every docs page's Markdown in sidebar order, one
 * file, with relative links made absolute. Generated from content/docs, so
 * it can never drift from the site.
 */
export function GET() {
  const content = buildLlmsFull({ productName: PRODUCT_NAME, baseUrl: getPublicBaseUrlFromEnv() });
  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
