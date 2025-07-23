import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { MeetingsContent } from "~/app/_components/MeetingsContent";

export default async function MeetingsPage() {
  return (
    <HydrateClient>
      <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          <MeetingsWrapper />
        </Suspense>
      </div>
    </HydrateClient>
  );
}

async function MeetingsWrapper() {
  const session = await auth();
  
  if (!session?.user) {
    return <Welcome />;
  }

  return <MeetingsContent />;
}