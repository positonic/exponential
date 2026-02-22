import { NextResponse } from "next/server";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

const SITE_URL = "https://www.exponential.im";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * GET /api/bounties/feed.xml — Atom feed of open bounties.
 * For RSS readers, aggregators, and bot scrapers.
 */
export async function GET() {
  const bounties = await db.action.findMany({
    where: {
      isBounty: true,
      bountyStatus: "OPEN",
      project: { isPublic: true },
    },
    take: 50,
    orderBy: { id: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      bountyAmount: true,
      bountyToken: true,
      bountyDifficulty: true,
      bountySkills: true,
      bountyDeadline: true,
      bountyMaxClaimants: true,
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

  const updated = new Date();

  const entries = bounties
    .map((b) => {
      const url = `${SITE_URL}/explore/${b.project?.slug}/bounties/${b.id}`;
      const reward = b.bountyAmount
        ? `${b.bountyAmount.toString()} ${b.bountyToken ?? "USDC"}`
        : "Unspecified";
      const skills = b.bountySkills.length > 0 ? b.bountySkills.join(", ") : "None specified";
      const deadline = b.bountyDeadline
        ? `Deadline: ${b.bountyDeadline.toISOString()}`
        : "No deadline";

      const summary = [
        b.description ?? "",
        "",
        `Reward: ${reward}`,
        `Difficulty: ${b.bountyDifficulty ?? "unspecified"}`,
        `Skills: ${skills}`,
        `Claims: ${b._count.bountyClaims}/${b.bountyMaxClaimants}`,
        deadline,
        `Project: ${b.project?.name ?? "Unknown"}`,
      ].join("\n");

      return `  <entry>
    <id>${escapeXml(url)}</id>
    <title>${escapeXml(b.name)}</title>
    <link href="${escapeXml(url)}" rel="alternate" />
    <updated>${updated.toISOString()}</updated>
    <summary type="text">${escapeXml(summary)}</summary>
    <category term="${escapeXml(b.bountyDifficulty ?? "unspecified")}" label="Difficulty" />
${b.bountySkills.map((s) => `    <category term="${escapeXml(s)}" label="Skill" />`).join("\n")}
  </entry>`;
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_URL}/api/bounties/feed.xml</id>
  <title>Exponential — Open Bounties</title>
  <subtitle>Open bounties from public projects on Exponential</subtitle>
  <link href="${SITE_URL}/api/bounties/feed.xml" rel="self" type="application/atom+xml" />
  <link href="${SITE_URL}/explore" rel="alternate" type="text/html" />
  <updated>${updated.toISOString()}</updated>
  <author>
    <name>Exponential</name>
    <uri>${SITE_URL}</uri>
  </author>
${entries}
</feed>`;

  return new NextResponse(feed, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
