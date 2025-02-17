import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";

export default async function Home({ params }: { params: { slug: string } }) {
  const  { slug } = params;
  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#111111] to-[#212121] text-white">       
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
