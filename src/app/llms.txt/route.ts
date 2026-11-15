import { NextResponse } from "next/server";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildLlmsIndex } from "~/lib/docs/llmsText";

export const dynamic = "force-dynamic";

/**
 * GET /llms.txt — machine-readable map of the site for LLM agents
 * (https://llmstxt.org): every docs page by sidebar section, generated from
 * content/docs, followed by the blog feed. The full docs text is at
 * /llms-full.txt.
 */
export function GET() {
  const baseUrl = getPublicBaseUrlFromEnv();
  const appendix = `## Blog RSS Feed

${baseUrl}/blog/feed.xml
`;
  const content = buildLlmsIndex({ productName: PRODUCT_NAME, baseUrl, appendix });

  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
