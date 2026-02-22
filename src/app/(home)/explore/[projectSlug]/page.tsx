import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { ProjectPageClient } from "./ProjectPageClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ projectSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectSlug } = await params;
  const project = await api.bounty.getPublicProject({ slug: projectSlug });

  if (!project) {
    return { title: "Project Not Found | Exponential" };
  }

  return {
    title: `${project.name} — Bounties | Exponential`,
    description:
      project.description ??
      `Browse open bounties for ${project.name} on Exponential.`,
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
