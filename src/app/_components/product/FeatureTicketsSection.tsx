"use client";

import Link from "next/link";
import { Avatar, Badge, Skeleton, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { PriorityIcon } from "~/app/_components/product/PriorityIcon";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";
import { NotionSyncBadge } from "~/app/_components/product/NotionSyncBadge";
import { generateLinearId, ticketUrlId } from "~/lib/fun-ids";
import { STATUS_COLORS, STATUS_LABELS } from "~/lib/ticket-statuses";

/**
 * The Tickets block for a feature - the delivery work linked to it. Both the
 * feature detail page and the feature peek promised a ticket count in their
 * meta/properties but had no way to see the tickets themselves; this is that
 * list.
 *
 * Scoped by `featureId` exactly like the count on `feature.getById`
 * (`_count.tickets`), so the number in the section header and the rows below
 * it can never disagree. Rows follow the same reading order as the product
 * tickets list (ID, status, title, blockers, sync, priority, assignee).
 */
export function FeatureTicketsSection({
  featureId,
  productId,
  productName,
  funTicketIds,
  ticketsPath,
}: {
  featureId: string;
  productId: string;
  productName: string;
  /** Product setting: prefer the fun shortId over the Linear-style ID. */
  funTicketIds: boolean;
  /** Base href of the product's ticket pages (`.../products/<slug>/tickets`). */
  ticketsPath: string;
}) {
  const { data: tickets, isLoading } = api.product.ticket.list.useQuery(
    { productId, featureId },
    { enabled: !!productId && !!featureId },
  );

  if (isLoading) {
    return (
      <div className="border border-border-primary rounded-lg overflow-hidden">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`px-3 py-2.5 ${i === 0 ? "border-b border-border-primary" : ""}`}
          >
            <Skeleton height={16} />
          </div>
        ))}
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <Text size="xs" className="text-text-muted">
        No tickets yet - tickets are the delivery work that implements this
        feature.
      </Text>
    );
  }

  return (
    // The container-list grammar (see DESIGN.md): one bordered container,
    // divider-separated rows - same as Scopes, Requirements, and Docs.
    <div className="border border-border-primary rounded-lg overflow-hidden">
      {tickets.map((ticket, i) => {
        const displayId =
          funTicketIds && ticket.shortId
            ? ticket.shortId
            : ticket.number > 0
              ? generateLinearId(productName, ticket.number)
              : null;

        return (
          <Link
            key={ticket.id}
            href={`${ticketsPath}/${ticketUrlId(ticket)}`}
            className={`flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-surface-hover ${i < tickets.length - 1 ? "border-b border-border-primary" : ""}`}
          >
            <Text size="xs" className="text-text-muted font-mono w-14 shrink-0" lineClamp={1}>
              {displayId}
            </Text>
            <Badge
              size="xs"
              variant="filled"
              color={STATUS_COLORS[ticket.status] ?? "gray"}
              className="shrink-0"
              styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
            >
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </Badge>
            <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
              {ticket.title}
            </Text>
            <BlockedIndicator
              openBlockerCount={ticket.openBlockerCount}
              isBlocked={ticket.isBlocked}
            />
            <NotionSyncBadge syncs={ticket.syncs} size={14} />
            <div className="shrink-0">
              <PriorityIcon priority={ticket.priority} size={14} />
            </div>
            {ticket.assignee && (
              <Avatar size="xs" radius="xl" src={ticket.assignee.image} className="shrink-0">
                {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
              </Avatar>
            )}
          </Link>
        );
      })}
    </div>
  );
}
