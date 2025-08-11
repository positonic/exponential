import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { api } from "~/trpc/server";
import { startOfDay } from "date-fns";
import { NavigationWrapper } from "../../_components/NavigationWrapper";

export default async function Home() {
  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-start text-text-primary">
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
  
  // Declare todayRecord in the outer scope
  let todayRecord = null; // Or provide a more specific type if known, e.g., Awaited<ReturnType<typeof api.day.getByDate>> | null
  let todayExists = false;
  let calendarConnected = false;

  // Only check for today's record if user is authenticated
  if (session?.user) {
    // Check if a day record exists for today
    const today = startOfDay(new Date());
    console.log("today", today);
    // Assign the value inside the block
    todayRecord = await api.day.getByDate({ date: today });
    console.log("todayRecord", todayRecord);
    todayExists = !!todayRecord;

    // Check calendar connection status
    const calendarStatus = await api.calendar.getConnectionStatus();
    calendarConnected = calendarStatus.isConnected;
  }
  
  return session?.user ? (
    <NavigationWrapper 
      calendarConnected={calendarConnected}
      todayExists={todayExists}
      todayRecord={todayRecord}
    />
  ) : (
    <Welcome />
  );
}