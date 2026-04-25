import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Welcome } from "~/app/_components/Welcome";
import { Suspense } from "react";
import { ActionDetailContent } from "~/app/_components/ActionDetailContent";

interface PageProps {
  params: Promise<{ workspaceSlug: string; actionId: string }>;
}

export default async function ActionDetailPage({ params }: PageProps) {
  const { actionId, workspaceSlug } = await params;
  const session = await auth();

  if (!session?.user) {
    return <Welcome />;
  }

  return (
    <HydrateClient>
      <Suspense fallback={<div className="p-8 text-text-muted">Loading action...</div>}>
        <ActionDetailContent actionId={actionId} workspaceSlug={workspaceSlug} />
      </Suspense>
    </HydrateClient>
  );
}
