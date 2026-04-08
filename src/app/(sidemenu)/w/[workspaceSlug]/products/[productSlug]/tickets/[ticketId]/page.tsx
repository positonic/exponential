"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

const TYPE_COLORS: Record<string, string> = {
  BUG: "red",
  FEATURE: "blue",
  CHORE: "gray",
  IMPROVEMENT: "teal",
  SPIKE: "violet",
  RESEARCH: "yellow",
};

type TicketStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELLED";

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.ticketId as string;
  const productSlug = params.productSlug as string;
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  const { data: ticket, isLoading } = api.product.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: !!ticketId },
  );

  const [comment, setComment] = useState("");

  // Local edit state synced from ticket
  const [status, setStatus] = useState<TicketStatus | null>(null);
  useEffect(() => {
    if (ticket) setStatus(ticket.status);
  }, [ticket]);

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
      if (ticket?.product.id) {
        await utils.product.ticket.list.invalidate({
          productId: ticket.product.id,
        });
      }
    },
  });

  const deleteTicket = api.product.ticket.delete.useMutation({
    onSuccess: async () => {
      if (ticket?.product.id) {
        await utils.product.ticket.list.invalidate({
          productId: ticket.product.id,
        });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products/${productSlug}/tickets`);
      }
    },
  });

  const addComment = api.product.ticket.addComment.useMutation({
    onSuccess: async () => {
      setComment("");
      await utils.product.ticket.getById.invalidate({ id: ticketId });
    },
  });

  const deleteComment = api.product.ticket.deleteComment.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={40} width={300} />
        <Skeleton height={200} />
      </Stack>
    );
  }
  if (!ticket) return <Text className="text-text-muted">Ticket not found</Text>;

  const onStatusChange = (newStatus: string | null) => {
    if (!newStatus) return;
    setStatus(newStatus as TicketStatus);
    updateTicket.mutate({
      id: ticketId,
      status: newStatus as TicketStatus,
    });
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete ticket",
      children: (
        <Text size="sm">
          This will permanently delete the ticket and all comments.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteTicket.mutate({ id: ticketId }),
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div className="flex-1">
          <Group gap="sm" mb={4}>
            <Badge color={TYPE_COLORS[ticket.type] ?? "gray"} variant="light">
              {ticket.type.toLowerCase()}
            </Badge>
            {ticket.points !== null && ticket.points !== undefined && (
              <Badge variant="outline">{ticket.points} pts</Badge>
            )}
          </Group>
          <Title order={2} className="text-text-primary">
            {ticket.title}
          </Title>
          {ticket.assignee && (
            <Text size="sm" className="text-text-muted mt-1">
              Assigned to @{ticket.assignee.name}
            </Text>
          )}
        </div>
        <Group>
          <Select
            data={STATUS_OPTIONS}
            value={status}
            onChange={onStatusChange}
            w={160}
          />
          <Button color="red" variant="outline" onClick={onDelete}>
            Delete
          </Button>
        </Group>
      </Group>

      {ticket.body && (
        <Card className="border border-border-primary bg-surface-secondary">
          <Text className="text-text-primary whitespace-pre-wrap">
            {ticket.body}
          </Text>
        </Card>
      )}

      {/* Metadata */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="xs">
          <Title order={5} className="text-text-primary">
            Links & metadata
          </Title>
          {ticket.feature && (
            <Text size="sm" className="text-text-muted">
              Feature:{" "}
              <Link
                href={`/w/${workspace?.slug}/products/${productSlug}/features/${ticket.feature.id}`}
                className="text-blue-500 hover:underline"
              >
                {ticket.feature.name}
              </Link>
            </Text>
          )}
          {ticket.epic && (
            <Text size="sm" className="text-text-muted">
              Epic: <span className="text-text-primary">{ticket.epic.name}</span>
            </Text>
          )}
          {ticket.cycle && (
            <Text size="sm" className="text-text-muted">
              Cycle: <span className="text-text-primary">{ticket.cycle.name}</span>
            </Text>
          )}
          {ticket.branchName && (
            <Text size="sm" className="text-text-muted">
              Branch: <code className="text-text-primary">{ticket.branchName}</code>
            </Text>
          )}
          {ticket.prUrl && (
            <Text size="sm" className="text-text-muted">
              PR:{" "}
              <Anchor href={ticket.prUrl} target="_blank" size="sm">
                {ticket.prUrl}
              </Anchor>
            </Text>
          )}
          {ticket.designUrl && (
            <Text size="sm" className="text-text-muted">
              Design:{" "}
              <Anchor href={ticket.designUrl} target="_blank" size="sm">
                {ticket.designUrl}
              </Anchor>
            </Text>
          )}
          {ticket.specUrl && (
            <Text size="sm" className="text-text-muted">
              Spec:{" "}
              <Anchor href={ticket.specUrl} target="_blank" size="sm">
                {ticket.specUrl}
              </Anchor>
            </Text>
          )}
        </Stack>
      </Card>

      {/* Sub-actions */}
      {ticket.actions.length > 0 && (
        <Card className="border border-border-primary bg-surface-secondary">
          <Title order={5} className="text-text-primary mb-2">
            Sub-actions
          </Title>
          <Stack gap="xs">
            {ticket.actions.map((a) => (
              <Text key={a.id} size="sm" className="text-text-primary">
                • {a.name}{" "}
                <Text size="xs" span className="text-text-muted">
                  ({a.kanbanStatus ?? a.status})
                </Text>
              </Text>
            ))}
          </Stack>
        </Card>
      )}

      {/* Comments */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Stack gap="sm">
          <Title order={5} className="text-text-primary">
            Comments
          </Title>
          {ticket.comments.length === 0 ? (
            <Text size="sm" className="text-text-muted italic">
              No comments yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {ticket.comments.map((c) => (
                <Card
                  key={c.id}
                  className="border border-border-primary bg-background-primary"
                >
                  <Group justify="space-between" align="flex-start">
                    <div className="flex-1">
                      <Text size="xs" className="text-text-muted">
                        @{c.author.name} - {new Date(c.createdAt).toLocaleString()}
                      </Text>
                      <Text size="sm" className="text-text-primary mt-1 whitespace-pre-wrap">
                        {c.content}
                      </Text>
                    </div>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => deleteComment.mutate({ id: c.id })}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}

          <Stack gap="xs">
            <Textarea
              placeholder="Add a comment..."
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Group justify="flex-end">
              <Button
                size="xs"
                onClick={() =>
                  addComment.mutate({ ticketId, content: comment })
                }
                loading={addComment.isPending}
                disabled={!comment.trim()}
              >
                Post comment
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
