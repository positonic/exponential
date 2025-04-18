import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";

export default async function Home() {
  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-start text-white">       
        <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
          <Suspense fallback={<div>Loading...</div>}>
            <ActionsWrapper />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ActionsWrapper() {
  const session = await auth();
  return session?.user ? <Actions viewName="upcoming"/> : <Welcome />;
}
