import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { ProjectContent } from "~/app/_components/ProjectContent";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ params }: PageProps) {
  const resolvedParams = await params;
  // If you need searchParams, await it as well:
  // const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { slug } = resolvedParams;
  
  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-center text-white">       
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <Suspense fallback={<div>Loading...</div>}>
            <ProjectWrapper slug={slug} />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ProjectWrapper({ slug }: { slug: string }) {
  const session = await auth();
  const viewName = `project-${slug}`;
  
  if (!session?.user) {
    return <Welcome />;
  }
  const projectId = slug.split('-')[1];
  if (!projectId) {
    return <div>Project not found</div>;
  }

  return <ProjectContent viewName={viewName} projectId={projectId} />;
}
