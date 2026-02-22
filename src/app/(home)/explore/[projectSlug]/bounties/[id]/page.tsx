import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { BountyDetailClient } from "./BountyDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ projectSlug: string; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bounty = await api.bounty.getPublic({ id });

  if (!bounty) {
    return { title: "Bounty Not Found | Exponential" };
  }

  return {
    title: `${bounty.name} — Bounty | Exponential`,
    description:
      bounty.description ?? `View bounty details for ${bounty.name}`,
  };
}

export default async function BountyDetailPage({ params }: Props) {
  const { projectSlug, id } = await params;
  void api.bounty.getPublic.prefetch({ id });

  return (
    <HydrateClient>
      <BountyDetailClient bountyId={id} projectSlug={projectSlug} />
    </HydrateClient>
  );
}
