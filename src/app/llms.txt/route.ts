import { NextResponse } from "next/server";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildLlmsIndex } from "~/lib/docs/llmsText";

export const dynamic = "force-dynamic";

/**
 * GET /llms.txt — machine-readable map of the site for LLM agents
 * (https://llmstxt.org): every docs page by sidebar section, generated from
 * content/docs, followed by the public bounty API. The full docs text is at
 * /llms-full.txt.
 */
export function GET() {
  const baseUrl = getPublicBaseUrlFromEnv();
  const bountyApi = `## Bounty API

Base URL: ${baseUrl}

### List open bounties
GET /api/bounties
GET /api/bounties?difficulty=beginner&skills=typescript
GET /api/bounties?limit=50&status=OPEN

### Get bounty details
GET /api/bounties/{id}

### Browse bounties (HTML)
${baseUrl}/explore

### Blog RSS Feed
${baseUrl}/blog/feed.xml

## Response Format

All API endpoints return JSON. Example bounty object:

    {
      "id": "abc123",
      "title": "Implement OAuth flow",
      "description": "Add Google OAuth...",
      "reward": { "amount": "100", "token": "USDC" },
      "difficulty": "intermediate",
      "skills": ["typescript", "nextjs"],
      "deadline": "2026-03-15T00:00:00.000Z",
      "claims": { "current": 1, "max": 3 },
      "status": "OPEN",
      "project": { "name": "My Project", "slug": "my-project" },
      "url": "/explore/my-project/bounties/abc123"
    }

## Query Parameters (GET /api/bounties)

- limit: Number of results (1-100, default 20)
- cursor: Pagination cursor from previous response
- difficulty: Filter by difficulty (beginner, intermediate, advanced)
- skills: Comma-separated skill filter (e.g., skills=typescript,react)
- projectId: Filter by project ID
- status: Bounty status (OPEN, IN_PROGRESS, IN_REVIEW, COMPLETED, CANCELLED)

## Authentication

Claiming bounties requires authentication. Contact the project owner or
sign in at ${baseUrl}/signin to get started.
`;
  const content = buildLlmsIndex({ productName: PRODUCT_NAME, baseUrl, appendix: bountyApi });

  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
