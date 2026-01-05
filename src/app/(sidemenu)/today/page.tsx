import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { api } from "~/trpc/server";
import { startOfDay } from "date-fns";
import { NavigationWrapper } from "../../_components/NavigationWrapper";

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tab = typeof resolvedSearchParams?.tab === 'string' ? resolvedSearchParams.tab : undefined;

  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-start text-text-primary">
        <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
          <Suspense fallback={<div>Loading...</div>}>
            <ActionsWrapper initialTab={tab} />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ActionsWrapper({ initialTab }: { initialTab?: string }) {
  const session = await auth();

  let todayExists = false;
  let calendarConnected = false;

  // Only check for today's record if user is authenticated
  if (session?.user) {
    // Check if a day record exists for today
    const today = startOfDay(new Date());
    const todayRecord = await api.day.getByDate({ date: today });
    todayExists = !!todayRecord;

    // Check calendar connection status
    const calendarStatus = await api.calendar.getConnectionStatus();
    calendarConnected = calendarStatus.isConnected;
  }

  return session?.user ? (
    <NavigationWrapper
      calendarConnected={calendarConnected}
      todayExists={todayExists}
      initialTab={initialTab}
    />
  ) : (
    <Welcome />
  );
}