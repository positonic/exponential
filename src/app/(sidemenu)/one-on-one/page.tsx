import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { OneOnOneBoard } from "~/app/_components/OneOnOneBoard";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function OneOnOnePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/use-the-force");
  }

  return (
    <HydrateClient>
      <main className="flex h-full flex-col text-text-primary">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <OneOnOneBoard />
        </Suspense>
      </main>
    </HydrateClient>
  );
}