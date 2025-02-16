import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
import { Welcome } from "~/app/_components/Welcome";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    void api.post.getLatest.prefetch();
  }

  return (
    <HydrateClient>
     <main className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#111111] to-[#212121] text-white">       
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          {session?.user ? <Actions /> : <Welcome />}
        </div>
      </main>
    </HydrateClient>
  );
}
