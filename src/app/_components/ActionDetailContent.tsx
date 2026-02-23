"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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
  IconClock,
  IconUser,
  IconTag,
  IconFolder,
  IconFlag,
  IconCircleDot,
} from "@tabler/icons-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";
import { PRIORITY_OPTIONS } from "~/types/action";
import { CommentThread } from "~/plugins/okr/client/components/CommentThread";
import { CommentInput } from "~/plugins/okr/client/components/CommentInput";
import { AssignActionModal } from "./AssignActionModal";
import { DeadlinePicker } from "./DeadlinePicker";
import { UnifiedDatePicker } from "./UnifiedDatePicker";
import { TagSelector } from "./TagSelector";

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
  const { data: session } = useSession();
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

  // Fetch agents for @mention autocomplete
  const { data: mastraAgents } = api.mastra.getMastraAgents.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Fetch teams linked to this workspace (for @mention of team members)
  const { data: teamsForLinking } = api.workspace.getUserTeamsForLinking.useQuery(
    { workspaceId: workspace?.id ?? "" },
    { enabled: !!workspace?.id },
  );

  // Local state for inline editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [assignModalOpened, setAssignModalOpened] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Sync state when action loads
  useEffect(() => {
    if (action) {
      setTitleValue(action.name);
      setDescriptionValue(action.description ?? "");
      setSelectedTagIds(action.tags?.map((t) => t.tag.id) ?? []);
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

  const updateCommentMutation = api.actionComment.updateComment.useMutation({
    onSuccess: () => {
      void utils.actionComment.getComments.invalidate({ actionId });
    },
  });

  const setTagsMutation = api.tag.setActionTags.useMutation({
    onSuccess: () => {
      void utils.action.getById.invalidate({ id: actionId });
      void utils.action.getAll.invalidate();
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

  const handleTagChange = useCallback(
    (tagIds: string[]) => {
      setSelectedTagIds(tagIds);
      setTagsMutation.mutate({ actionId, tagIds });
    },
    [actionId, setTagsMutation],
  );

  const handleAddComment = async (content: string) => {
    await addCommentMutation.mutateAsync({ actionId, content });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteCommentMutation.mutate({ commentId });
  };

  const handleEditComment = async (commentId: string, content: string) => {
    await updateCommentMutation.mutateAsync({ commentId, content });
  };

  // Build mention candidates from workspace members + linked team members + agents
  const mentionCandidates: MentionCandidate[] = useMemo(() => {
    const seenIds = new Set<string>();
    const members: MentionCandidate[] = [];

    // Direct workspace members
    for (const m of workspace?.members ?? []) {
      if (!seenIds.has(m.user.id)) {
        seenIds.add(m.user.id);
        members.push({
          id: m.user.id,
          name: m.user.name ?? m.user.email ?? "Unknown",
          type: "member" as const,
          image: m.user.image,
        });
      }
    }

    // Members from teams linked to this workspace
    const linkedTeams = (teamsForLinking ?? []).filter((t) => t.isLinkedToThisWorkspace);
    for (const team of linkedTeams) {
      for (const tm of team.members) {
        if (!seenIds.has(tm.user.id)) {
          seenIds.add(tm.user.id);
          members.push({
            id: tm.user.id,
            name: tm.user.name ?? tm.user.email ?? "Unknown",
            type: "member" as const,
            image: tm.user.image,
          });
        }
      }
    }

    const agents: MentionCandidate[] = (mastraAgents ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      type: "agent" as const,
      image: null,
    }));

    return [...members, ...agents];
  }, [workspace?.members, teamsForLinking, mastraAgents]);

  const mentionNames = useMemo(
    () => mentionCandidates.map((c) => c.name),
    [mentionCandidates],
  );

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
    <>
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
            comments={comments.map((c: { id: string; content: string; createdAt: Date | string; updatedAt?: Date | string; author: { id: string; name: string | null; image: string | null } }) => ({
              ...c,
              createdAt: new Date(c.createdAt),
              updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
            }))}
            onDeleteComment={handleDeleteComment}
            onEditComment={handleEditComment}
            currentUserId={session?.user?.id}
            mentionNames={mentionNames}
          />

          <CommentInput
            onSubmit={handleAddComment}
            isSubmitting={addCommentMutation.isPending}
            placeholder="Leave a comment... Use @ to mention"
            mentionCandidates={mentionCandidates}
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
              styles={{
                option: { paddingLeft: 12, paddingRight: 12 },
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
              styles={{
                option: { paddingLeft: 12, paddingRight: 12 },
              }}
            />
          </PropertyRow>

          {/* Assignees */}
          <PropertyRow icon={<IconUser size={16} />} label="Assignees">
            <div
              className="cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover transition-colors"
              onClick={() => setAssignModalOpened(true)}
            >
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
            </div>
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
              styles={{
                option: { paddingLeft: 12, paddingRight: 12 },
              }}
              clearable
              placeholder="None"
              searchable
            />
          </PropertyRow>

          {/* Due Date */}
          <PropertyRow icon={<IconCalendar size={16} />} label="Due Date">
            <DeadlinePicker
              value={action.dueDate ? new Date(action.dueDate) : null}
              onChange={(date) => handlePropertyUpdate("dueDate", date)}
              notificationContext="action"
            />
          </PropertyRow>

          {/* Scheduled Start */}
          <PropertyRow icon={<IconClock size={16} />} label="Scheduled">
            <UnifiedDatePicker
              value={action.scheduledStart ? new Date(action.scheduledStart) : null}
              onChange={(date) => {
                if (date) {
                  const existing = action.scheduledStart ? new Date(action.scheduledStart) : null;
                  const existingHours = existing?.getHours() ?? 9;
                  const existingMinutes = existing?.getMinutes() ?? 0;
                  const newDate = new Date(date);
                  newDate.setHours(existingHours, existingMinutes, 0, 0);
                  handlePropertyUpdate("scheduledStart", newDate);
                } else {
                  handlePropertyUpdate("scheduledStart", null);
                }
              }}
              mode="single"
              notificationContext="action"
            />
          </PropertyRow>

          {/* Tags */}
          <PropertyRow icon={<IconTag size={16} />} label="Tags">
            <TagSelector
              selectedTagIds={selectedTagIds}
              onChange={handleTagChange}
              workspaceId={workspace?.id}
            />
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
    <AssignActionModal
      opened={assignModalOpened}
      onClose={() => {
        setAssignModalOpened(false);
        void utils.action.getById.invalidate({ id: actionId });
      }}
      actionId={action.id}
      actionName={action.name}
      projectId={action.projectId}
      currentAssignees={action.assignees ?? []}
    />
    </>
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
