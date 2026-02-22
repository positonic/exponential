"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Text,
  TextInput,
  Textarea,
  Select,
  Badge,
  Group,
  Stack,
  ActionIcon,
  Tooltip,
  Divider,
  Avatar,
  Skeleton,
  Breadcrumbs,
  Anchor,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCalendar,
  IconUser,
  IconTag,
  IconFolder,
  IconFlag,
  IconCircleDot,
} from "@tabler/icons-react";
import { DatePickerInput } from "@mantine/dates";
import Link from "next/link";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { PRIORITY_OPTIONS } from "~/types/action";
import { CommentThread } from "~/plugins/okr/client/components/CommentThread";
import { CommentInput } from "~/plugins/okr/client/components/CommentInput";

const KANBAN_STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: "gray",
  TODO: "blue",
  IN_PROGRESS: "yellow",
  IN_REVIEW: "violet",
  DONE: "green",
  CANCELLED: "red",
};

interface ActionDetailContentProps {
  actionId: string;
  workspaceSlug: string;
}

export function ActionDetailContent({
  actionId,
  workspaceSlug,
}: ActionDetailContentProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const utils = api.useUtils();

  // Fetch action data
  const {
    data: action,
    isLoading,
    error,
  } = api.action.getById.useQuery({ id: actionId });

  // Fetch comments
  const { data: comments = [] } = api.actionComment.getComments.useQuery(
    { actionId },
    { enabled: !!actionId },
  );

  // Fetch projects for the dropdown
  const { data: projects } = api.project.getAll.useQuery();

  // Local state for inline editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Sync state when action loads
  useEffect(() => {
    if (action) {
      setTitleValue(action.name);
      setDescriptionValue(action.description ?? "");
    }
  }, [action]);

  // Mutations
  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.action.getById.invalidate({ id: actionId });
      void utils.action.getAll.invalidate();
      void utils.action.getProjectActions.invalidate();
    },
    onError: (err) => {
      notifications.show({
        title: "Update Failed",
        message: err.message,
        color: "red",
      });
    },
  });

  const updateStatus = api.action.updateKanbanStatus.useMutation({
    onSuccess: () => {
      void utils.action.getById.invalidate({ id: actionId });
      void utils.action.getAll.invalidate();
    },
  });

  const addCommentMutation = api.actionComment.addComment.useMutation({
    onSuccess: () => {
      void utils.actionComment.getComments.invalidate({ actionId });
    },
  });

  const deleteCommentMutation = api.actionComment.deleteComment.useMutation({
    onSuccess: () => {
      void utils.actionComment.getComments.invalidate({ actionId });
    },
  });

  // Handlers
  const handleTitleSave = useCallback(() => {
    if (!action || !titleValue.trim()) return;
    if (titleValue !== action.name) {
      updateAction.mutate({ id: action.id, name: titleValue.trim() });
    }
    setEditingTitle(false);
  }, [action, titleValue, updateAction]);

  const handleDescriptionSave = useCallback(() => {
    if (!action) return;
    if (descriptionValue !== (action.description ?? "")) {
      updateAction.mutate({
        id: action.id,
        description: descriptionValue || undefined,
      });
    }
    setIsEditingDescription(false);
  }, [action, descriptionValue, updateAction]);

  const handlePropertyUpdate = useCallback(
    (field: string, value: unknown) => {
      if (!action) return;
      updateAction.mutate({ id: action.id, [field]: value });
    },
    [action, updateAction],
  );

  const handleStatusChange = useCallback(
    (status: string) => {
      if (!action) return;
      updateStatus.mutate({
        actionId: action.id,
        kanbanStatus: status as "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED",
      });
    },
    [action, updateStatus],
  );

  const handleAddComment = async (content: string) => {
    await addCommentMutation.mutateAsync({ actionId, content });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteCommentMutation.mutate({ commentId });
  };

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-8">
          <Skeleton height={32} width={200} mb="lg" />
          <Skeleton height={40} mb="md" />
          <Skeleton height={100} mb="lg" />
          <Skeleton height={200} />
        </div>
        <div className="w-80 border-l border-border-primary p-6">
          <Skeleton height={24} width={120} mb="lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={36} mb="md" />
          ))}
        </div>
      </div>
    );
  }

  if (error ?? !action) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Stack align="center" gap="md">
          <Text className="text-text-muted" size="lg">
            Action not found or access denied
          </Text>
          <Anchor
            component={Link}
            href={`/w/${workspaceSlug}/actions`}
            className="text-brand-primary"
          >
            Back to actions
          </Anchor>
        </Stack>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[action.kanbanStatus ?? ""] ?? "gray";

  return (
    <div className="flex h-[calc(100vh-60px)]">
      {/* Left Panel - Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Breadcrumb + Back */}
        <Group gap="md" mb="lg">
          <ActionIcon
            variant="subtle"
            onClick={() => router.back()}
            className="text-text-muted hover:text-text-primary"
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
          <Breadcrumbs
            classNames={{
              separator: "text-text-muted",
            }}
          >
            <Anchor
              component={Link}
              href={`/w/${workspaceSlug}/actions`}
              size="sm"
              className="text-text-muted hover:text-text-primary"
            >
              {workspace?.name ?? "Workspace"}
            </Anchor>
            {action.project && (
              <Anchor
                component={Link}
                href={`/w/${workspaceSlug}/projects/${action.project.slug ?? action.project.id}`}
                size="sm"
                className="text-text-muted hover:text-text-primary"
              >
                {action.project.name}
              </Anchor>
            )}
            <Text size="sm" className="text-text-secondary" truncate>
              {action.name}
            </Text>
          </Breadcrumbs>
        </Group>

        {/* Status Badge */}
        <Group mb="md">
          {action.kanbanStatus && (
            <Badge color={statusColor} variant="light" size="sm">
              {KANBAN_STATUS_OPTIONS.find(
                (s) => s.value === action.kanbanStatus,
              )?.label ?? action.kanbanStatus}
            </Badge>
          )}
          <Text size="xs" className="text-text-muted">
            {action.id}
          </Text>
        </Group>

        {/* Title - Inline Editable */}
        {editingTitle ? (
          <TextInput
            value={titleValue}
            onChange={(e) => setTitleValue(e.currentTarget.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSave();
              if (e.key === "Escape") {
                setTitleValue(action.name);
                setEditingTitle(false);
              }
            }}
            autoFocus
            variant="unstyled"
            classNames={{
              input:
                "text-2xl font-bold text-text-primary border-b-2 border-border-focus",
            }}
            mb="md"
          />
        ) : (
          <Text
            className="text-2xl font-bold text-text-primary cursor-text hover:bg-surface-hover rounded px-1 -mx-1 transition-colors"
            onClick={() => setEditingTitle(true)}
            mb="md"
          >
            {action.name}
          </Text>
        )}

        {/* Description - Editable */}
        <div className="mb-8">
          {isEditingDescription ? (
            <Textarea
              value={descriptionValue}
              onChange={(e) =>
                setDescriptionValue(e.currentTarget.value)
              }
              onBlur={handleDescriptionSave}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDescriptionValue(action.description ?? "");
                  setIsEditingDescription(false);
                }
              }}
              autoFocus
              minRows={3}
              maxRows={10}
              autosize
              classNames={{
                input:
                  "bg-surface-secondary border-border-primary text-text-primary",
              }}
              placeholder="Add a description..."
            />
          ) : (
            <div
              className="min-h-[60px] cursor-text rounded p-2 -mx-2 hover:bg-surface-hover transition-colors"
              onClick={() => setIsEditingDescription(true)}
            >
              {action.description ? (
                <Text
                  className="text-text-secondary whitespace-pre-wrap"
                  size="sm"
                >
                  {action.description}
                </Text>
              ) : (
                <Text className="text-text-muted" size="sm">
                  Add a description...
                </Text>
              )}
            </div>
          )}
        </div>

        <Divider className="border-border-primary" mb="lg" />

        {/* Activity / Discussion */}
        <div>
          <Text className="text-text-primary font-semibold" size="sm" mb="md">
            Activity
          </Text>

          <CommentThread
            comments={comments.map((c: { id: string; content: string; createdAt: Date | string; author: { id: string; name: string | null; image: string | null } }) => ({
              ...c,
              createdAt: new Date(c.createdAt),
            }))}
            onDeleteComment={handleDeleteComment}
            currentUserId={action.createdBy?.id}
          />

          <CommentInput
            onSubmit={handleAddComment}
            isSubmitting={addCommentMutation.isPending}
            placeholder="Leave a comment..."
          />
        </div>
      </div>

      {/* Right Panel - Properties Sidebar */}
      <div className="w-80 border-l border-border-primary overflow-y-auto p-6 bg-surface-secondary/30">
        <Text
          className="text-text-muted uppercase tracking-wider font-semibold"
          size="xs"
          mb="lg"
        >
          Properties
        </Text>

        <Stack gap="lg">
          {/* Status */}
          <PropertyRow icon={<IconCircleDot size={16} />} label="Status">
            <Select
              value={action.kanbanStatus ?? undefined}
              onChange={(val) => val && handleStatusChange(val)}
              data={KANBAN_STATUS_OPTIONS}
              size="xs"
              variant="unstyled"
              classNames={{
                input: "text-text-primary font-medium",
              }}
            />
          </PropertyRow>

          {/* Priority */}
          <PropertyRow icon={<IconFlag size={16} />} label="Priority">
            <Select
              value={action.priority}
              onChange={(val) =>
                val && handlePropertyUpdate("priority", val)
              }
              data={PRIORITY_OPTIONS.map((p) => ({
                value: p,
                label: p,
              }))}
              size="xs"
              variant="unstyled"
              classNames={{
                input: "text-text-primary font-medium",
              }}
            />
          </PropertyRow>

          {/* Assignees */}
          <PropertyRow icon={<IconUser size={16} />} label="Assignees">
            {action.assignees && action.assignees.length > 0 ? (
              <Group gap="xs">
                {action.assignees.map((a) => (
                  <Tooltip key={a.user.id} label={a.user.name ?? a.user.email}>
                    <Avatar
                      src={a.user.image}
                      size="sm"
                      radius="xl"
                    >
                      {(a.user.name ?? a.user.email ?? "?")[0]?.toUpperCase()}
                    </Avatar>
                  </Tooltip>
                ))}
              </Group>
            ) : (
              <Text size="xs" className="text-text-muted">
                Unassigned
              </Text>
            )}
          </PropertyRow>

          {/* Project */}
          <PropertyRow icon={<IconFolder size={16} />} label="Project">
            <Select
              value={action.projectId ?? undefined}
              onChange={(val) =>
                handlePropertyUpdate(
                  "projectId",
                  val ?? undefined,
                )
              }
              data={
                projects?.map((p) => ({
                  value: p.id,
                  label: p.name,
                })) ?? []
              }
              size="xs"
              variant="unstyled"
              classNames={{
                input: "text-text-primary font-medium",
              }}
              clearable
              placeholder="None"
              searchable
            />
          </PropertyRow>

          {/* Due Date */}
          <PropertyRow icon={<IconCalendar size={16} />} label="Due Date">
            <DatePickerInput
              value={action.dueDate ? new Date(action.dueDate) : null}
              onChange={(date) => handlePropertyUpdate("dueDate", date)}
              size="xs"
              variant="unstyled"
              classNames={{
                input: "text-text-primary font-medium",
              }}
              placeholder="No due date"
              clearable
            />
          </PropertyRow>

          {/* Tags */}
          <PropertyRow icon={<IconTag size={16} />} label="Tags">
            {action.tags && action.tags.length > 0 ? (
              <Group gap={4}>
                {action.tags.map((t) => (
                  <Badge
                    key={t.tag.id}
                    size="xs"
                    variant="light"
                    color={t.tag.color || "gray"}
                  >
                    {t.tag.name}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text size="xs" className="text-text-muted">
                No tags
              </Text>
            )}
          </PropertyRow>

          {/* Epic */}
          {action.epic && (
            <PropertyRow icon={<IconFlag size={16} />} label="Epic">
              <Badge size="xs" variant="light">
                {action.epic.name}
              </Badge>
            </PropertyRow>
          )}

          <Divider className="border-border-primary" />

          {/* Meta info */}
          <PropertyRow icon={<IconUser size={16} />} label="Created by">
            <Group gap="xs">
              <Avatar src={action.createdBy?.image} size="xs" radius="xl">
                {(action.createdBy?.name ?? "?")[0]?.toUpperCase()}
              </Avatar>
              <Text size="xs" className="text-text-secondary">
                {action.createdBy?.name ?? "Unknown"}
              </Text>
            </Group>
          </PropertyRow>

          {action.completedAt && (
            <PropertyRow icon={<IconCalendar size={16} />} label="Completed">
              <Text size="xs" className="text-text-secondary">
                {new Date(action.completedAt).toLocaleDateString()}
              </Text>
            </PropertyRow>
          )}
        </Stack>
      </div>
    </div>
  );
}

/** Small helper for consistent property row layout */
function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Group gap="xs" mb={4}>
        <span className="text-text-muted">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </Group>
      <div className="ml-6">{children}</div>
    </div>
  );
}
