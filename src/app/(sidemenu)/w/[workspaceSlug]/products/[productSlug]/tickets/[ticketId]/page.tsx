"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCalendar,
  IconCategory,
  IconCircleDot,
  IconClock,
  IconFlag,
  IconFlame,
  IconFolder,
  IconGitBranch,
  IconLink,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";

// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

const TYPE_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "CHORE", label: "Chore" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "SPIKE", label: "Spike" },
  { value: "RESEARCH", label: "Research" },
];

type TicketStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELLED";

// ---------------------------------------------------------------------------

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
  const [status, setStatus] = useState<TicketStatus | null>(null);

  useEffect(() => {
    if (ticket) setStatus(ticket.status);
  }, [ticket]);

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
      if (ticket?.product.id) {
        await utils.product.ticket.list.invalidate({ productId: ticket.product.id });
      }
    },
  });

  const deleteTicket = api.product.ticket.delete.useMutation({
    onSuccess: async () => {
      if (ticket?.product.id) {
        await utils.product.ticket.list.invalidate({ productId: ticket.product.id });
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

  const handleFieldUpdate = (field: string, value: unknown) => {
    updateTicket.mutate({ id: ticketId, [field]: value });
  };

  const onStatusChange = (val: string | null) => {
    if (!val) return;
    setStatus(val as TicketStatus);
    handleFieldUpdate("status", val);
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete ticket",
      children: <Text size="sm">This will permanently delete the ticket and all comments.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteTicket.mutate({ id: ticketId }),
    });
  };

  return (
    <div className="flex min-h-0">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto pr-4">
        <Stack gap="lg">
          {/* Title + delete */}
          <Group justify="space-between" align="flex-start">
            <div className="flex-1">
              <Title order={2} className="text-text-primary">
                {ticket.title}
              </Title>
              <Text size="xs" className="text-text-muted mt-1">
                {ticket.id}
              </Text>
            </div>
            <ActionIcon variant="subtle" color="red" onClick={onDelete} title="Delete ticket">
              <IconTrash size={18} />
            </ActionIcon>
          </Group>

          {/* Body - render HTML */}
          {ticket.body && (
            <div
              className="prose prose-sm prose-invert max-w-none text-text-primary"
              dangerouslySetInnerHTML={{ __html: ticket.body }}
            />
          )}

          {/* Activity / Comments */}
          <div>
            <Title order={4} className="text-text-primary mb-3">
              Activity
            </Title>

            {ticket.comments.length === 0 ? (
              <Text size="sm" className="text-text-muted italic">
                No comments yet. Start the discussion!
              </Text>
            ) : (
              <Stack gap="sm" mb="md">
                {ticket.comments.map((c) => (
                  <div key={c.id} className="border border-border-primary rounded-lg p-3 bg-surface-secondary">
                    <Group justify="space-between" align="flex-start">
                      <div className="flex-1">
                        <Group gap="xs" mb={2}>
                          <Avatar size="xs" radius="xl">
                            {(c.author.name ?? "?")[0]?.toUpperCase()}
                          </Avatar>
                          <Text size="xs" fw={500} className="text-text-secondary">
                            {c.author.name}
                          </Text>
                          <Text size="xs" className="text-text-muted">
                            {new Date(c.createdAt).toLocaleString()}
                          </Text>
                        </Group>
                        <Text size="sm" className="text-text-primary whitespace-pre-wrap">
                          {c.content}
                        </Text>
                      </div>
                      <ActionIcon variant="subtle" color="red" size="sm" onClick={() => deleteComment.mutate({ id: c.id })}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </div>
                ))}
              </Stack>
            )}

            <Stack gap="xs" mt="md">
              <Textarea
                placeholder="Leave a comment..."
                value={comment}
                onChange={(e) => setComment(e.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Group justify="flex-end">
                <Button
                  size="xs"
                  onClick={() => addComment.mutate({ ticketId, content: comment })}
                  loading={addComment.isPending}
                  disabled={!comment.trim()}
                >
                  Post comment
                </Button>
              </Group>
            </Stack>
          </div>
        </Stack>
      </div>

      {/* Properties sidebar */}
      <PropertiesSidebar>
        {/* Status */}
        <PropertyRow icon={<IconCircleDot size={16} />} label="Status">
          <Select
            value={status}
            onChange={onStatusChange}
            data={STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
            classNames={{ input: "text-text-primary font-medium" }}
          />
        </PropertyRow>

        {/* Priority */}
        <PropertyRow icon={<IconFlag size={16} />} label="Priority">
          <Select
            value={ticket.priority != null ? String(ticket.priority) : undefined}
            onChange={(val) => handleFieldUpdate("priority", val != null ? Number(val) : null)}
            data={PRIORITY_OPTIONS}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            classNames={{ input: "text-text-primary font-medium" }}
          />
        </PropertyRow>

        {/* Type */}
        <PropertyRow icon={<IconCategory size={16} />} label="Type">
          <Select
            value={ticket.type}
            onChange={(val) => val && handleFieldUpdate("type", val)}
            data={TYPE_OPTIONS}
            size="xs"
            variant="unstyled"
            classNames={{ input: "text-text-primary font-medium" }}
          />
        </PropertyRow>

        {/* Assignee */}
        <PropertyRow icon={<IconUser size={16} />} label="Assignee">
          {ticket.assignee ? (
            <Group gap="xs">
              <Avatar size="sm" radius="xl">
                {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
              </Avatar>
              <Text size="xs" className="text-text-secondary">
                {ticket.assignee.name}
              </Text>
            </Group>
          ) : (
            <Text size="xs" className="text-text-muted">Unassigned</Text>
          )}
        </PropertyRow>

        {/* Points */}
        {ticket.points != null && (
          <PropertyRow icon={<IconFlame size={16} />} label="Effort">
            <Text size="xs" className="text-text-primary font-medium">
              {ticket.points} pts
            </Text>
          </PropertyRow>
        )}

        {/* Feature */}
        {ticket.feature && (
          <PropertyRow icon={<IconFolder size={16} />} label="Feature">
            <Link
              href={`/w/${workspace?.slug}/products/${productSlug}/features/${ticket.feature.id}`}
              className="text-xs text-blue-400 hover:underline"
            >
              {ticket.feature.name}
            </Link>
          </PropertyRow>
        )}

        {/* Epic */}
        {ticket.epic && (
          <PropertyRow icon={<IconFlag size={16} />} label="Epic">
            <Badge size="xs" variant="light">{ticket.epic.name}</Badge>
          </PropertyRow>
        )}

        {/* Cycle */}
        {ticket.cycle && (
          <PropertyRow icon={<IconClock size={16} />} label="Cycle">
            <Text size="xs" className="text-text-primary">{ticket.cycle.name}</Text>
          </PropertyRow>
        )}

        {/* Links */}
        {(ticket.branchName ?? ticket.prUrl ?? ticket.designUrl ?? ticket.specUrl) && (
          <>
            <PropertyDivider />
            {ticket.branchName && (
              <PropertyRow icon={<IconGitBranch size={16} />} label="Branch">
                <Text size="xs" className="text-text-primary font-mono">{ticket.branchName}</Text>
              </PropertyRow>
            )}
            {ticket.prUrl && (
              <PropertyRow icon={<IconLink size={16} />} label="PR">
                <Anchor href={ticket.prUrl} target="_blank" size="xs">{ticket.prUrl}</Anchor>
              </PropertyRow>
            )}
            {ticket.designUrl && (
              <PropertyRow icon={<IconLink size={16} />} label="Design">
                <Anchor href={ticket.designUrl} target="_blank" size="xs">{ticket.designUrl}</Anchor>
              </PropertyRow>
            )}
            {ticket.specUrl && (
              <PropertyRow icon={<IconLink size={16} />} label="Spec">
                <Anchor href={ticket.specUrl} target="_blank" size="xs">{ticket.specUrl}</Anchor>
              </PropertyRow>
            )}
          </>
        )}

        <PropertyDivider />

        {/* Metadata */}
        <PropertyRow icon={<IconUser size={16} />} label="Created by">
          <Group gap="xs">
            <Avatar src={ticket.createdBy?.image} size="xs" radius="xl">
              {(ticket.createdBy?.name ?? "?")[0]?.toUpperCase()}
            </Avatar>
            <Text size="xs" className="text-text-secondary">
              {ticket.createdBy?.name ?? "Unknown"}
            </Text>
          </Group>
        </PropertyRow>

        <PropertyRow icon={<IconCalendar size={16} />} label="Created">
          <Text size="xs" className="text-text-secondary">
            {new Date(ticket.createdAt).toLocaleString()}
          </Text>
        </PropertyRow>

        {ticket.completedAt && (
          <PropertyRow icon={<IconCalendar size={16} />} label="Completed">
            <Text size="xs" className="text-text-secondary">
              {new Date(ticket.completedAt).toLocaleString()}
            </Text>
          </PropertyRow>
        )}
      </PropertiesSidebar>
    </div>
  );
}
