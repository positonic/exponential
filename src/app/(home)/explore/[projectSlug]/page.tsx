import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { ProjectPageClient } from "./ProjectPageClient";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ projectSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectSlug } = await params;
  const project = await api.bounty.getPublicProject({ slug: projectSlug });

  if (!project) {
    return { title: `Project Not Found | ${PRODUCT_NAME}` };
  }

  const description = project.description ?? `Browse open bounties for ${project.name} on ${PRODUCT_NAME}.`;
  const url = `${getPublicBaseUrlFromEnv()}/explore/${projectSlug}`;

  return {
    title: `${project.name} — Bounties | ${PRODUCT_NAME}`,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title: `${project.name} — Bounties | ${PRODUCT_NAME}`,
      description,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${project.name} — Bounties | ${PRODUCT_NAME}`,
      description,
      images: ['/og-image.png'],
    },
  };
}

export default async function ProjectExplorePage({ params }: Props) {
  const { projectSlug } = await params;
  void api.bounty.getPublicProject.prefetch({ slug: projectSlug });

  return (
    <HydrateClient>
      <ProjectPageClient slug={projectSlug} />
    </HydrateClient>
  );
}
