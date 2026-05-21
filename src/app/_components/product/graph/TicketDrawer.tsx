"use client";

import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Group,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowNarrowLeft,
  IconArrowNarrowRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { STATUS_COLORS, STATUS_LABELS } from "~/lib/ticket-statuses";

interface Props {
  ticketId: string | null;
  basePath: string;
  onClose: () => void;
}

const BODY_EXCERPT_LENGTH = 200;

export function TicketDrawer({ ticketId, basePath, onClose }: Props) {
  const opened = ticketId !== null;
  const { data: ticket, isLoading } = api.product.ticket.getById.useQuery(
    { id: ticketId ?? "" },
    { enabled: opened },
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      withCloseButton
      title={
        <Text fw={600} size="md" className="text-text-primary">
          Ticket detail
        </Text>
      }
    >
      {isLoading || !ticket ? (
        <Stack gap="sm">
          <Skeleton height={28} />
          <Skeleton height={16} width="60%" />
          <Skeleton height={80} />
        </Stack>
      ) : (
        <Stack gap="md">
          <Stack gap="xs">
            <Group gap="xs" align="center">
              <StatusPill status={ticket.status} />
              <Badge size="xs" variant="light">
                {ticket.type}
              </Badge>
            </Group>
            <Text fw={600} size="lg" className="text-text-primary">
              {ticket.title}
            </Text>
          </Stack>

          {ticket.assignee && (
            <Group gap="xs">
              <Avatar
                src={ticket.assignee.image}
                size="sm"
                radius="xl"
                alt={ticket.assignee.name ?? "Assignee"}
              >
                {(ticket.assignee.name ?? "?").slice(0, 1).toUpperCase()}
              </Avatar>
              <Text size="sm" className="text-text-primary">
                {ticket.assignee.name ?? ticket.assignee.email}
              </Text>
            </Group>
          )}

          {ticket.body && (
            <Text size="sm" className="text-text-muted" style={{ whiteSpace: "pre-wrap" }}>
              {ticket.body.length > BODY_EXCERPT_LENGTH
                ? `${ticket.body.slice(0, BODY_EXCERPT_LENGTH).trim()}…`
                : ticket.body}
            </Text>
          )}

          <DependencyList
            icon={<IconArrowNarrowLeft size={14} />}
            label="Depends on"
            tickets={ticket.dependsOn}
            basePath={basePath}
          />
          <DependencyList
            icon={<IconArrowNarrowRight size={14} />}
            label="Required for"
            tickets={ticket.requiredFor}
            basePath={basePath}
          />

          <Button
            component={Link}
            href={`${basePath}/tickets/${ticket.id}`}
            rightSection={<IconExternalLink size={14} />}
            variant="filled"
            fullWidth
          >
            Open full ticket
          </Button>
        </Stack>
      )}
    </Drawer>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "gray";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <Badge size="sm" variant="dot" color={color}>
      {label}
    </Badge>
  );
}

interface MinimalLinkedTicket {
  id: string;
  title: string;
  status: string;
}

function DependencyList({
  icon,
  label,
  tickets,
  basePath,
}: {
  icon: React.ReactNode;
  label: string;
  tickets: MinimalLinkedTicket[];
  basePath: string;
}) {
  if (tickets.length === 0) return null;
  return (
    <Stack gap={4}>
      <Group gap="xs">
        <span className="text-text-muted">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </Group>
      <Stack gap={2}>
        {tickets.map((t) => {
          const statusColor = STATUS_COLORS[t.status] ?? "gray";
          const statusLabel = STATUS_LABELS[t.status] ?? t.status;
          return (
            <Group key={t.id} gap="xs" wrap="nowrap" align="center">
              <Tooltip label={statusLabel} position="top" withArrow>
                <span
                  role="img"
                  aria-label={`Status: ${statusLabel}`}
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: `var(--mantine-color-${statusColor}-6)`,
                  }}
                />
              </Tooltip>
              <Text
                size="xs"
                component={Link}
                href={`${basePath}/tickets/${t.id}`}
                className="text-text-primary flex-1 min-w-0 hover:text-blue-400 transition-colors"
                lineClamp={1}
              >
                {t.title}
              </Text>
            </Group>
          );
        })}
      </Stack>
    </Stack>
  );
}
