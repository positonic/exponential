"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Card, Group, Paper, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { BOARD_COLUMNS, type TicketStatus } from "~/lib/ticket-statuses";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketItem {
  id: string;
  shortId: string | null;
  title: string;
  status: TicketStatus;
  priority: number | null;
  type: string;
  assignee: { id: string; name: string | null; image: string | null } | null;
  feature: { id: string; name: string } | null;
  epic: { id: string; name: string } | null;
}

const PRIORITY_LABELS: Record<number, string> = { 0: "Urgent", 1: "High", 2: "Medium", 3: "Low", 4: "None" };
const PRIORITY_COLORS: Record<number, string> = { 0: "red", 1: "orange", 2: "yellow", 3: "blue", 4: "gray" };
const TYPE_COLORS: Record<string, string> = { BUG: "red", FEATURE: "blue", CHORE: "gray", IMPROVEMENT: "teal", SPIKE: "violet", RESEARCH: "yellow" };

// ---------------------------------------------------------------------------
// TicketCard (draggable)
// ---------------------------------------------------------------------------

function TicketCard({ ticket, basePath, isDragOverlay }: { ticket: TicketItem; basePath: string; isDragOverlay?: boolean }) {
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
      {ticket.shortId && (
        <Text size="xs" className="text-text-muted font-mono mb-1">{ticket.shortId}</Text>
      )}
      <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
        {ticket.title}
      </Text>
      <Group gap="xs" mt="xs">
        <Badge size="xs" variant="light" color={TYPE_COLORS[ticket.type] ?? "gray"}>
          {ticket.type.toLowerCase()}
        </Badge>
        {ticket.priority != null && ticket.priority < 4 && (
          <Badge size="xs" variant="outline" color={PRIORITY_COLORS[ticket.priority] ?? "gray"}>
            {PRIORITY_LABELS[ticket.priority]}
          </Badge>
        )}
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
// Column (droppable)
// ---------------------------------------------------------------------------

function BoardColumn({ status, label, color, tickets, basePath }: {
  status: string; label: string; color: string; tickets: TicketItem[]; basePath: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <Paper
      ref={setNodeRef}
      className={`min-w-64 w-64 shrink-0 transition-all duration-200 ${isOver ? "ring-2 ring-blue-400 ring-opacity-50 bg-surface-hover" : ""}`}
      p="sm"
      radius="md"
      withBorder
    >
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="xs" className="uppercase tracking-wide text-text-muted">{label}</Text>
        <Badge size="xs" variant="light" color={color}>{tickets.length}</Badge>
      </Group>
      <Stack gap="xs">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} basePath={basePath} />
        ))}
        {tickets.length === 0 && (
          <div className="h-16 border-2 border-dashed border-border-secondary rounded-md flex items-center justify-center">
            <Text size="xs" className="text-text-muted">Drop here</Text>
          </div>
        )}
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

interface TicketKanbanBoardProps {
  tickets: TicketItem[];
  productId: string;
  basePath: string;
}

export function TicketKanbanBoard({ tickets, productId, basePath }: TicketKanbanBoardProps) {
  const utils = api.useUtils();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, TicketStatus>>({});

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.list.invalidate({ productId });
    },
    onError: (_err, variables) => {
      // Rollback optimistic move
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Apply optimistic moves
  const effectiveTickets = useMemo(() =>
    tickets.map((t) => optimisticMoves[t.id] ? { ...t, status: optimisticMoves[t.id]! } : t),
    [tickets, optimisticMoves],
  );

  const columnTickets = useMemo(() => {
    const map: Record<string, TicketItem[]> = {};
    for (const col of BOARD_COLUMNS) map[col.status] = [];
    for (const t of effectiveTickets) {
      (map[t.status] ??= []).push(t);
    }
    return map;
  }, [effectiveTickets]);

  const activeTicket = activeId ? effectiveTickets.find((t) => t.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const ticketId = active.id as string;
    const overColumn = BOARD_COLUMNS.find((c) => c.status === over.id);
    if (!overColumn) return;

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === overColumn.status) return;

    // Optimistic update
    setOptimisticMoves((prev) => ({ ...prev, [ticketId]: overColumn.status }));
    updateTicket.mutate({ id: ticketId, status: overColumn.status });
  }, [tickets, updateTicket]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((col) => (
          <BoardColumn
            key={col.status}
            status={col.status}
            label={col.label}
            color={col.color}
            tickets={columnTickets[col.status] ?? []}
            basePath={basePath}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket && <TicketCard ticket={activeTicket} basePath={basePath} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
