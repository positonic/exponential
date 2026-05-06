import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { ProjectContent } from "~/app/_components/ProjectContent";

interface PageProps {
  params: Promise<{ workspaceSlug: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceProjectDetailsLegacyPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { slug } = resolvedParams;
  const tab = typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab : undefined;

  return (
    <HydrateClient>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-stretch justify-start px-8 pb-20 pt-7">
        <Suspense fallback={<div>Loading...</div>}>
          <ProjectWrapper slug={slug} initialTab={tab} />
        </Suspense>
      </div>
    </HydrateClient>
  );
}

async function ProjectWrapper({ slug, initialTab }: { slug: string; initialTab?: string }) {
  const session = await auth();
  const viewName = `project-${slug}`;

  if (!session?.user) {
    return <Welcome />;
  }

  return <ProjectContent viewName={viewName} projectId={slug} initialTab={initialTab} legacyOverview />;
}
