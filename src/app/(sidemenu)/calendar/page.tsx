import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Suspense } from "react";
import { api } from "~/trpc/server";
import { CalendarPageContent } from "~/app/_components/calendar/CalendarPageContent";
import { redirect } from "next/navigation";

export default async function CalendarPage() {
  return (
    <HydrateClient>
      <main className="flex h-full flex-col text-text-primary">
        <Suspense fallback={<CalendarLoadingSkeleton />}>
          <CalendarWrapper />
        </Suspense>
      </main>
    </HydrateClient>
  );
}

async function CalendarWrapper() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  // Check calendar connection status
  const calendarStatus = await api.calendar.getConnectionStatus();

  return <CalendarPageContent calendarConnected={calendarStatus.isConnected} />;
}

function CalendarLoadingSkeleton() {
  return (
    <div className="flex h-full animate-pulse">
      <div className="flex-1 p-4">
        <div className="mb-4 h-12 rounded-lg bg-surface-secondary" />
        <div className="h-full rounded-lg bg-surface-secondary" />
      </div>
      <div className="w-64 border-l border-border-primary p-4">
        <div className="h-48 rounded-lg bg-surface-secondary" />
      </div>
    </div>
  );
}
