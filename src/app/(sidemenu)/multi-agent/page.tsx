import Chat from "~/app/_components/Chat";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { LandingPage } from "~/app/_components/LandingPage";
import { Suspense } from "react";
import MultiChat from "~/app/_components/MultiChat";

export default async function Home() {
  return (
    <HydrateClient>
      <Suspense fallback={<div>Loading...</div>}>
        <HomeContent />
      </Suspense>
    </HydrateClient>
  );
}

async function HomeContent() {
  const session = await auth();
  return session?.user ? <MultiChat /> : <LandingPage />;
}

