import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { ProjectContent } from "~/app/_components/ProjectContent";

interface PageProps {
  params: Promise<{ workspaceSlug: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceProjectPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { slug } = resolvedParams;
  const tab = typeof resolvedSearchParams?.tab === 'string' ? resolvedSearchParams.tab : undefined;

  return (
    <HydrateClient>
        <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
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
  const projectId = slug.split('-').pop();
  if (!projectId) {
    return <div>Project not found</div>;
  }

  return <ProjectContent viewName={viewName} projectId={projectId} initialTab={initialTab} />;
}
