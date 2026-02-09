import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { ProductivityPageContent } from "~/app/_components/ProductivityPageContent";

export default async function ProductivityPage() {
  return (
    <HydrateClient>
      <main className="flex h-full flex-col items-center justify-start text-text-primary">
        <div className="container flex flex-col items-stretch justify-start gap-4 px-4 py-8">
          <Suspense fallback={<div>Loading...</div>}>
            <ProductivityWrapper />
          </Suspense>
        </div>
      </main>
    </HydrateClient>
  );
}

async function ProductivityWrapper() {
  const session = await auth();
  return session?.user ? <ProductivityPageContent /> : <Welcome />;
}
