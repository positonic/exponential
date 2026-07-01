"use client";

import { useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Card, Group, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { BOARD_COLUMNS, type TicketStatus } from "~/lib/ticket-statuses";
import { PriorityIcon } from "~/app/_components/product/PriorityIcon";
import { BlockedIndicator } from "~/app/_components/product/TicketDependenciesSection";
import { generateLinearId } from "~/lib/fun-ids";
import { KanbanBoard as SharedKanbanBoard } from "~/app/_components/shared/kanban";
import type { ColumnAccent, KanbanColumnDef, KanbanItem } from "~/app/_components/shared/kanban";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketItem {
  id: string;
  shortId: string | null;
  number: number;
  title: string;
  status: TicketStatus;
  priority: number | null;
  type: string;
  assignee: { id: string; name: string | null; image: string | null } | null;
  feature: { id: string; name: string } | null;
  epic: { id: string; name: string } | null;
  openBlockerCount: number;
  isBlocked: boolean;
}

type BoardItem = TicketItem & KanbanItem;

const TYPE_COLORS: Record<string, string> = { BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow" };

// Map the centralised ticket-status Mantine colours (~/lib/ticket-statuses) onto
// the shared board's accent vocabulary (ADR-0037).
function mapStatusColorToAccent(color: string): ColumnAccent {
  switch (color) {
    case "blue":
    case "indigo":
      return "brand";
    case "grape":
    case "violet":
      return "violet";
    case "orange":
    case "yellow":
      return "amber";
    case "green":
    case "teal":
      return "green";
    case "red":
      return "red";
    case "gray":
    case "dark":
    default:
      return "slate";
  }
}

// ---------------------------------------------------------------------------
// TicketCard (draggable) — unchanged; owns its own useSortable
// ---------------------------------------------------------------------------

function TicketCard({ ticket, basePath, isDragOverlay, funTicketIds, productName }: { ticket: TicketItem; basePath: string; isDragOverlay?: boolean; funTicketIds: boolean; productName: string }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  return (
    <Card
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-grab active:cursor-grabbing"
      padding="sm"
      radius="sm"
      onClick={(e: React.MouseEvent) => {
        if (!isDragging && !isDragOverlay) {
          e.stopPropagation();
          router.push(`${basePath}/${ticket.id}`);
        }
      }}
    >
      {(() => {
        const displayId = funTicketIds && ticket.shortId
          ? ticket.shortId
          : ticket.number > 0
            ? generateLinearId(productName, ticket.number)
            : null;
        return displayId ? (
          <Text size="xs" className="text-text-muted font-mono mb-1">{displayId}</Text>
        ) : null;
      })()}
      <div className="flex items-start gap-2">
        <Text size="sm" fw={500} className="text-text-primary flex-1 min-w-0" lineClamp={2}>
          {ticket.title}
        </Text>
        <BlockedIndicator
          openBlockerCount={ticket.openBlockerCount}
          isBlocked={ticket.isBlocked}
        />
      </div>
      <Group gap="xs" mt="xs">
        <Badge size="xs" variant="light" color={TYPE_COLORS[ticket.type] ?? "gray"}>
          {ticket.type.toLowerCase()}
        </Badge>
        <PriorityIcon priority={ticket.priority} size={14} />
      </Group>
      {(ticket.feature ?? ticket.assignee) && (
        <Group gap="xs" mt="xs">
          {ticket.feature && (
            <Text size="xs" className="text-text-muted" lineClamp={1}>{ticket.feature.name}</Text>
          )}
        </Group>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

interface TicketKanbanBoardProps {
  tickets: TicketItem[];
  productId: string;
  productName: string;
  funTicketIds: boolean;
  basePath: string;
}

const BOARD_STATUSES = new Set<string>(BOARD_COLUMNS.map((c) => c.value));

export function TicketKanbanBoard({ tickets, productId, productName, funTicketIds, basePath }: TicketKanbanBoardProps) {
  const utils = api.useUtils();

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.list.invalidate({ productId });
    },
  });

  const columns = useMemo<KanbanColumnDef[]>(
    () => BOARD_COLUMNS.map((c) => ({ id: c.value, title: c.label, accent: mapStatusColorToAccent(c.color) })),
    [],
  );

  // Tag each ticket with its column; drop ARCHIVED (no column) so it stays excluded.
  const items = useMemo<BoardItem[]>(
    () =>
      tickets
        .filter((t) => BOARD_STATUSES.has(t.status))
        .map((t) => ({ ...t, columnId: t.status })),
    [tickets],
  );

  const handleMove = (itemId: string, toColumnId: string) =>
    updateTicket.mutateAsync({ id: itemId, status: toColumnId as TicketStatus });

  return (
    <SharedKanbanBoard<BoardItem>
      columns={columns}
      items={items}
      onMove={handleMove}
      getItemLabel={(item) => item.title}
      columnEmptyState="Drop here"
      renderCard={(item, { isOverlay }) => (
        <TicketCard
          ticket={item}
          basePath={basePath}
          isDragOverlay={isOverlay}
          funTicketIds={funTicketIds}
          productName={productName}
        />
      )}
    />
  );
}
