import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { DoPageContent } from "~/app/_components/DoPageContent";

export type DoFilter = "today" | "tomorrow" | "upcoming";

const VALID_DO_FILTERS: DoFilter[] = ["today", "tomorrow", "upcoming"];

function isValidDoFilter(value: string | null | undefined): value is DoFilter {
  return value != null && VALID_DO_FILTERS.includes(value as DoFilter);
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TodayPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filterParam = typeof resolvedSearchParams?.filter === 'string' ? resolvedSearchParams.filter : undefined;
  const filter: DoFilter = isValidDoFilter(filterParam) ? filterParam : "today";

  // The redesigned /today shell renders full-bleed (its own top bar + filter
  // row span edge-to-edge with bottom borders). For tomorrow/upcoming we keep
  // the legacy container padding.
  const isToday = filter === "today";

  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-stretch justify-start text-text-primary">
        {isToday ? (
          <Suspense fallback={<div className="p-6">Loading...</div>}>
            <ActionsWrapper initialFilter={filter} />
          </Suspense>
        ) : (
          <div className="container flex flex-col items-stretch justify-start px-4 pb-20 pt-6">
            <Suspense fallback={<div>Loading...</div>}>
              <ActionsWrapper initialFilter={filter} />
            </Suspense>
          </div>
        )}
      </main>
    </HydrateClient>
  );
}

async function ActionsWrapper({ initialFilter }: { initialFilter: DoFilter }) {
  const session = await auth();
  return session?.user ? <DoPageContent initialFilter={initialFilter} /> : <Welcome />;
}
