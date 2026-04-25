import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { ExplorePageClient } from "./ExplorePageClient";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export const dynamic = "force-dynamic";

const exploreUrl = `${getPublicBaseUrlFromEnv()}/explore`;

export const metadata: Metadata = {
  title: `Explore Bounties | ${PRODUCT_NAME}`,
  description:
    "Browse open bounties across public projects. Find work, earn rewards, and contribute to open source.",
  alternates: {
    canonical: exploreUrl,
  },
  openGraph: {
    type: 'website',
    title: `Explore Bounties | ${PRODUCT_NAME}`,
    description: "Browse open bounties across public projects. Find work, earn rewards, and contribute to open source.",
    url: exploreUrl,
    siteName: PRODUCT_NAME,
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Explore Bounties | ${PRODUCT_NAME}`,
    description: "Browse open bounties across public projects. Find work, earn rewards, and contribute to open source.",
    images: ['/og-image.png'],
  },
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
