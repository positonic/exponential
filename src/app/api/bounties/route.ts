import { type NextRequest, NextResponse } from "next/server";
import { type BountyStatus } from "@prisma/client";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/bounties — Plain JSON list of open bounties.
 * No auth required. Designed for AI agents, bots, and aggregators.
 *
 * Query params:
 *   limit     - Number of results (1–100, default 20)
 *   cursor    - Pagination cursor (bounty ID)
 *   difficulty - Filter: beginner | intermediate | advanced
 *   skills    - Comma-separated skill filter
 *   projectId - Filter by project ID
 *   status    - Bounty status (default: OPEN)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 100);
  const cursor = params.get("cursor") ?? undefined;
  const difficulty = params.get("difficulty") ?? undefined;
  const skills = params.get("skills")?.split(",").filter(Boolean) ?? undefined;
  const projectId = params.get("projectId") ?? undefined;
  const status = (params.get("status") ?? "OPEN") as BountyStatus;

  const bounties = await db.action.findMany({
    where: {
      isBounty: true,
      bountyStatus: status,
      project: { isPublic: true },
      ...(difficulty ? { bountyDifficulty: difficulty } : {}),
      ...(projectId ? { projectId } : {}),
      ...(skills?.length ? { bountySkills: { hasSome: skills } } : {}),
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      bountyAmount: true,
      bountyToken: true,
      bountyStatus: true,
      bountyDifficulty: true,
      bountySkills: true,
      bountyDeadline: true,
      bountyMaxClaimants: true,
      bountyExternalUrl: true,
      project: {
        select: {
          name: true,
          slug: true,
        },
      },
      _count: {
        select: { bountyClaims: { where: { status: { in: ["ACTIVE", "SUBMITTED"] } } } },
      },
    },
  });

  let nextCursor: string | undefined;
  if (bounties.length > limit) {
    const nextItem = bounties.pop();
    nextCursor = nextItem?.id;
  }

  // Count total matching bounties for the response
  const total = await db.action.count({
    where: {
      isBounty: true,
      bountyStatus: status,
      project: { isPublic: true },
      ...(difficulty ? { bountyDifficulty: difficulty } : {}),
      ...(projectId ? { projectId } : {}),
      ...(skills?.length ? { bountySkills: { hasSome: skills } } : {}),
    },
  });

  const result = {
    bounties: bounties.map((b) => ({
      id: b.id,
      title: b.name,
      description: b.description,
      reward: b.bountyAmount
        ? { amount: b.bountyAmount.toString(), token: b.bountyToken ?? "USDC" }
        : null,
      difficulty: b.bountyDifficulty,
      skills: b.bountySkills,
      deadline: b.bountyDeadline?.toISOString() ?? null,
      claims: { current: b._count.bountyClaims, max: b.bountyMaxClaimants },
      status: b.bountyStatus,
      project: b.project
        ? {
            name: b.project.name,
            slug: b.project.slug,
            url: `/explore/${b.project.slug}`,
          }
        : null,
      url: b.project
        ? `/explore/${b.project.slug}/bounties/${b.id}`
        : null,
      externalUrl: b.bountyExternalUrl,
    })),
    nextCursor: nextCursor ?? null,
    total,
  };

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
