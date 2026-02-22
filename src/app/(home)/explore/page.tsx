import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { ExplorePageClient } from "./ExplorePageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore Bounties | Exponential",
  description:
    "Browse open bounties across public projects. Find work, earn rewards, and contribute to open source.",
};

export default async function ExplorePage() {
  void api.bounty.listPublicProjects.prefetch({ limit: 20 });
  void api.bounty.listPublic.prefetch({ limit: 20 });

  return (
    <HydrateClient>
      <ExplorePageClient />
    </HydrateClient>
  );
}
