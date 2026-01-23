import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Projects } from "~/app/_components/Projects";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    void api.post.getLatest.prefetch();
  }

  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-center text-text-primary">       
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <Suspense fallback={<div>Loading...</div>}>
            <ProjectsWrapper />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ProjectsWrapper() {
  const session = await auth();
  return session?.user ? <Projects showAllWorkspaces={true} /> : <Welcome />;
}
