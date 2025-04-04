import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { TodayButton } from "../../_components/TodayButton";
import { DaysTable } from "../../_components/DaysTable";
import { api } from "~/trpc/server";
import { startOfDay } from "date-fns";

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
  
  // Only check for today's record if user is authenticated
  let todayExists = false;
  if (session?.user) {
    // Check if a day record exists for today
    const today = startOfDay(new Date());
    const todayRecord = await api.day.getByDate({ date: today });
    todayExists = !!todayRecord;
  }
  
  return session?.user ? (
    <>
      <Actions viewName="today" />
      <div className="flex flex-col gap-6">
        {!todayExists && <TodayButton />}
        {/* <div className="mt-4">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">Recent Days</h2>
          <DaysTable />
        </div> */}
      </div>
    </>
  ) : (
    <Welcome />
  );
}
