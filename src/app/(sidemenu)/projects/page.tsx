import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { WorkspaceProjectsConceptD } from "~/app/_components/projects/WorkspaceProjectsConceptD";
import { Welcome } from "~/app/_components/Welcome";

export default async function Home() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="flex h-full flex-col text-text-primary">
        {session?.user ? (
          <WorkspaceProjectsConceptD showAllWorkspaces={true} />
        ) : (
          <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
            <Welcome />
          </div>
        )}
      </main>
    </HydrateClient>
  );
}
