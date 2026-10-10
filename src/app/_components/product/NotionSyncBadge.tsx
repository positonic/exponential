"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { IconBrandNotion } from "@tabler/icons-react";
import { notionPageUrl } from "~/lib/notionUrl";

export interface TicketSyncLinkView {
  provider: string;
  externalId: string;
  externalUrl: string | null;
  lastSyncedAt: Date | string;
  tombstonedAt: Date | string | null;
}

/**
 * Notion badge for a synced ticket: deep-links to the Notion counterpart,
 * tooltip shows the last-synced time. Muted when the counterpart is archived
 * (tombstoned sync record). Renders nothing for unsynced tickets.
 */
export function NotionSyncBadge({
  syncs,
  size = 16,
}: {
  syncs?: TicketSyncLinkView[] | null;
  size?: number;
}) {
  const sync = syncs?.find((s) => s.provider === "notion");
  if (!sync) return null;

  // Adoption-era sync records stored only the page id; derive the canonical
  // URL so their badges deep-link too.
  const href = sync.externalUrl ?? notionPageUrl(sync.externalId);

  const label = sync.tombstonedAt
    ? "Notion counterpart archived"
    : `Synced with Notion · last synced ${new Date(sync.lastSyncedAt).toLocaleString()}`;

  const icon = (
    <IconBrandNotion
      size={size}
      className={sync.tombstonedAt ? "text-text-muted opacity-50" : "text-text-secondary"}
    />
  );

  return (
    <Tooltip label={label} withArrow>
      {href ? (
        <ActionIcon
          component="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="subtle"
          size="sm"
          className="shrink-0"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label="Open in Notion"
        >
          {icon}
        </ActionIcon>
      ) : (
        <span className="shrink-0 inline-flex items-center">{icon}</span>
      )}
    </Tooltip>
  );
}
