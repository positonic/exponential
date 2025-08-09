import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Actions } from "~/app/_components/Actions";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { TodayButton } from "../../_components/TodayButton";
import { GoogleCalendarConnect } from "../../_components/GoogleCalendarConnect";
import { TodayCalendarEvents } from "../../_components/TodayCalendarEvents";
import { api } from "~/trpc/server";
import { startOfDay, format } from "date-fns";
import Link from "next/link";
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
    <>
      <Actions viewName="today" />
      <div className="w-full max-w-3xl mx-auto">
        <div className="mb-4">
          <GoogleCalendarConnect isConnected={calendarConnected} />
        </div>
        {calendarConnected && (
          <div className="mb-6">
            <TodayCalendarEvents />
          </div>
        )}
        {!todayExists && <TodayButton />}
        {/* Now todayRecord is accessible here and we use the formatted date for the link */}
        {todayExists && todayRecord && todayRecord.date && (
          <Link href={`/days/${format(todayRecord.date, 'yyyy-MM-dd')}`} className="text-blue-500">
            Diverge, Converge, Synthesize
          </Link>
        )}
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
