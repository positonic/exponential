import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/bounties/[id] — Single bounty detail as plain JSON.
 * No auth required. Designed for AI agents, bots, and aggregators.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const bounty = await db.action.findFirst({
    where: {
      id,
      isBounty: true,
      project: { isPublic: true },
    },
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
          description: true,
        },
      },
      _count: {
        select: { bountyClaims: { where: { status: { in: ["ACTIVE", "SUBMITTED"] } } } },
      },
    },
  });

  if (!bounty) {
    return NextResponse.json(
      { error: "Bounty not found" },
      { status: 404 }
    );
  }

  const result = {
    id: bounty.id,
    title: bounty.name,
    description: bounty.description,
    reward: bounty.bountyAmount
      ? { amount: bounty.bountyAmount.toString(), token: bounty.bountyToken ?? "USDC" }
      : null,
    difficulty: bounty.bountyDifficulty,
    skills: bounty.bountySkills,
    deadline: bounty.bountyDeadline?.toISOString() ?? null,
    claims: { current: bounty._count.bountyClaims, max: bounty.bountyMaxClaimants },
    status: bounty.bountyStatus,
    project: bounty.project
      ? {
          name: bounty.project.name,
          slug: bounty.project.slug,
          description: bounty.project.description,
          url: `/explore/${bounty.project.slug}`,
        }
      : null,
    url: bounty.project
      ? `/explore/${bounty.project.slug}/bounties/${bounty.id}`
      : null,
    externalUrl: bounty.bountyExternalUrl,
  };

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
