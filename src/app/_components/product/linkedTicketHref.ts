/**
 * Where a dependency row links to.
 *
 * ADR-0002 lets a ticket depend on a ticket in a sibling Product of the same
 * Workspace. The ticket pages resolve a ticket within the Product in the URL,
 * so a foreign ticket must be linked through its own Product's tickets path,
 * not the current one's, or it lands on "ticket not found".
 *
 * `basePath` is the current Product's tickets path,
 * `/w/<workspace>/products/<product>/tickets`, as every caller builds it.
 */
export interface LinkedTicketProduct {
  id: string;
  name: string;
  slug: string;
}

export function isForeignTicket(
  currentProductId: string,
  ticket: { product?: LinkedTicketProduct | null },
): boolean {
  return !!ticket.product && ticket.product.id !== currentProductId;
}

export function linkedTicketHref(
  basePath: string,
  currentProductId: string,
  ticket: { id: string; product?: LinkedTicketProduct | null },
): string {
  if (!ticket.product || !isForeignTicket(currentProductId, ticket)) {
    return `${basePath}/${ticket.id}`;
  }
  const foreignBase = basePath.replace(
    /\/products\/[^/]+\/tickets$/,
    `/products/${encodeURIComponent(ticket.product.slug)}/tickets`,
  );
  return `${foreignBase}/${ticket.id}`;
}
