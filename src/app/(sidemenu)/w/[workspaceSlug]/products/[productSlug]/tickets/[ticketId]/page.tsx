import { api, HydrateClient } from "~/trpc/server";
import { TicketDetailClient } from "./TicketDetailClient";

interface PageProps {
  params: Promise<{
    workspaceSlug: string;
    productSlug: string;
    ticketId: string;
  }>;
}

/**
 * Server shell for the ticket detail page. Streams the ticket with the RSC
 * payload instead of waiting for JS load and then a workspace → resolveId →
 * getById waterfall. getByRef is keyed on URL params alone, so this prefetch
 * starts without awaiting anything: an await here would suspend the page
 * behind loading.tsx on every ticket navigation, and React holds a revealed
 * Suspense fallback for ~300ms. The input must match the client's getByRef
 * useQuery exactly or the cache won't hit.
 */
export default async function TicketDetailPage({ params }: PageProps) {
  const { workspaceSlug, productSlug, ticketId } = await params;

  void api.product.ticket.getByRef.prefetch({
    workspaceSlug,
    productSlug,
    identifier: ticketId,
  });

  return (
    <HydrateClient>
      <TicketDetailClient />
    </HydrateClient>
  );
}
