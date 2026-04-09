"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus, IconTicket } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { CreateTicketModal } from "~/app/_components/product/CreateTicketModal";

const STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const TYPE_COLORS: Record<string, string> = {
  BUG: "red",
  FEATURE: "blue",
  CHORE: "gray",
  IMPROVEMENT: "teal",
  SPIKE: "violet",
  RESEARCH: "yellow",
};

export default function TicketsBoardPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [modalOpened, setModalOpened] = useState(false);

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: tickets, isLoading } = api.product.ticket.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/tickets`;

  const byStatus = new Map<string, typeof tickets>();
  for (const s of STATUSES) byStatus.set(s, []);
  for (const t of tickets ?? []) {
    const bucket = byStatus.get(t.status);
    if (bucket) bucket.push(t);
  }

  return (
    <Stack gap="lg">
      <Group justify="flex-end">
        <Button
          onClick={() => setModalOpened(true)}
          leftSection={<IconPlus size={16} />}
          color="brand"
          disabled={!product}
        >
          New ticket
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={100} />
          ))}
        </Stack>
      ) : tickets && tickets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <Card
                key={status}
                className="border border-border-primary bg-surface-secondary"
              >
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={600} size="sm" className="text-text-primary">
                      {STATUS_LABELS[status]}
                    </Text>
                    <Badge variant="light" size="sm">
                      {items.length}
                    </Badge>
                  </Group>
                  {items.map((ticket) => (
                    <Link key={ticket.id} href={`${basePath}/${ticket.id}`}>
                      <Card
                        padding="sm"
                        className="border border-border-primary bg-background-primary hover:border-border-focus transition-colors"
                      >
                        <Group gap="xs" mb={4}>
                          <Badge
                            size="xs"
                            color={TYPE_COLORS[ticket.type] ?? "gray"}
                            variant="light"
                          >
                            {ticket.type}
                          </Badge>
                          {ticket.points != null && (
                            <Badge size="xs" variant="outline">
                              {ticket.points}pt
                            </Badge>
                          )}
                        </Group>
                        <Text size="sm" className="text-text-primary" lineClamp={2}>
                          {ticket.title}
                        </Text>
                      </Card>
                    </Link>
                  ))}
                </Stack>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={IconTicket}
          title="No tickets yet"
          message="Create your first ticket to start tracking work."
          action={
            <Button
              onClick={() => setModalOpened(true)}
              leftSection={<IconPlus size={16} />}
              color="brand"
              disabled={!product}
            >
              New ticket
            </Button>
          }
        />
      )}

      {product && (
        <CreateTicketModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          productId={product.id}
          productName={product.name}
          basePath={basePath}
          features={features}
          cycles={cycles}
          epics={epics}
        />
      )}
    </Stack>
  );
}
