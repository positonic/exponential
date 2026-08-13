import { api, HydrateClient } from "~/trpc/server";
import { db } from "~/server/db";
import { CycleDetailClient } from "./CycleDetailClient";

interface PageProps {
  params: Promise<{
    workspaceSlug: string;
    productSlug: string;
    cycleId: string;
  }>;
}

/**
 * Server shell for the cycle detail page. Prefetches the queries the client
 * tree needs (cycle, workspace, product header) so they stream with the RSC
 * payload instead of waiting for JS load → client fetch round trips. Inputs
 * must match the client useQuery keys exactly or the cache won't hit.
 */
export default async function CycleDetailPage({ params }: PageProps) {
  const { workspaceSlug, productSlug, cycleId } = await params;

  void api.product.cycle.getById.prefetch({ id: cycleId });
  void api.workspace.getBySlug.prefetch({ slug: workspaceSlug });

  // ProductLayout's header query keys on { workspaceId, slug }, so resolve the
  // workspace id (single indexed lookup) before prefetching it. This is a
  // slug→id resolution only, not an access-checked read: the id never reaches
  // the client on its own, and every prefetched procedure above enforces
  // workspace membership itself before returning data.
  const workspace = await db.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true },
  });
  if (workspace) {
    void api.product.product.getBySlug.prefetch({
      workspaceId: workspace.id,
      slug: productSlug,
    });
  }

  return (
    <HydrateClient>
      <CycleDetailClient />
    </HydrateClient>
  );
}
