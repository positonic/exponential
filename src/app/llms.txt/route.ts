import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /llms.txt — Machine-readable site description for LLM agents.
 * Follows the emerging llms.txt convention (similar to robots.txt).
 */
export function GET() {
  const content = `# Exponential — Open Source Project Management with Bounties

> Exponential is a project management platform where teams post bounties
> (paid tasks) that contributors — human or AI — can claim and complete.

## Bounty API

Base URL: https://www.exponential.im

### List open bounties
GET /api/bounties
GET /api/bounties?difficulty=beginner&skills=typescript
GET /api/bounties?limit=50&status=OPEN

### Get bounty details
GET /api/bounties/{id}

### Browse bounties (HTML)
https://www.exponential.im/explore

### Blog RSS Feed
https://www.exponential.im/blog/feed.xml

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
sign in at https://www.exponential.im/signin to get started.
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
