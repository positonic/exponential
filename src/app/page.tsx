import Chat from "~/app/_components/Chat";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { LandingPage } from "~/app/_components/LandingPage";
import { Suspense } from "react";

export default async function Home() {
  return (
    <HydrateClient>
      <main className="min-h-screen w-full bg-gradient-to-b from-[#111111] to-[#212121] text-white">       
        <Suspense fallback={<div>Loading...</div>}>
          <HomeContent />
        </Suspense>
      </main>
    </HydrateClient>
  );
}

async function HomeContent() {
  const session = await auth();
  return session?.user ? <Chat /> : <LandingPage />;
}

