import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";

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
            <ActionsWrapper slug={slug}/>
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ActionsWrapper({ slug }: { slug: string }) {
  const session = await auth();
 
  const viewName = `project-${slug}`;
  return session?.user ? <Actions viewName={viewName} /> : <Welcome />;
}
