"use client";

import { Badge, type BadgeProps } from "@mantine/core";
import { STATUS_COLORS, STATUS_LABELS } from "~/lib/ticket-statuses";

/**
 * The coloured status pill shown in the ticket detail header ("QA",
 * "In progress", …). Shared so every surface that names a ticket's status
 * renders the same pill.
 */
export function TicketStatusBadge({
  status,
  ...props
}: { status: string } & Omit<BadgeProps, "color" | "children">) {
  return (
    <Badge
      size="xs"
      variant="filled"
      color={STATUS_COLORS[status] ?? "gray"}
      styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
      {...props}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
