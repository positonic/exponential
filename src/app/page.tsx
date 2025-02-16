import Chat from "~/app/_components/Chat";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";

export default async function Home() {
  const session = await auth();

  return (
    <HydrateClient>
        <main className="min-h-screen w-full bg-gradient-to-b from-[#111111] to-[#212121] text-white">       
          {session?.user ? <Chat /> : <Welcome />}
        </main>
    </HydrateClient>
  );
}

