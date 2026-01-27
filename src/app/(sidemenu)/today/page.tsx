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

  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-start text-text-primary">
        <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
          <Suspense fallback={<div>Loading...</div>}>
            <ActionsWrapper initialFilter={filter} />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ActionsWrapper({ initialFilter }: { initialFilter: DoFilter }) {
  const session = await auth();
  return session?.user ? <DoPageContent initialFilter={initialFilter} /> : <Welcome />;
}
