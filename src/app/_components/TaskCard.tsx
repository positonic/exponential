"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text, Group, Avatar, Stack, Menu, Tooltip, HoverCard, Modal, Button, Divider, Badge } from "@mantine/core";
import { IconDots, IconEdit, IconTrash, IconArrowsMaximize, IconCheck, IconList } from "@tabler/icons-react";
import { AssignActionModal } from "./AssignActionModal";
import { EditActionModal } from "./EditActionModal";
import { TagBadgeList } from "./TagBadge";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";
import { HTMLContent } from "./HTMLContent";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import styles from "./ProjectTasks.module.css";

type ActionStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";

interface Task {
  id: string;
  name: string;
  description?: string | null;
  dueDate?: Date | null;
  kanbanStatus?: ActionStatus | null;
  priority: string;
  projectId?: string | null;
  kanbanOrder?: number | null;
  assignees: Array<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    };
  }>;
  tags?: Array<{
    tag: {
      id: string;
      name: string;
      slug: string;
      color: string;
    };
  }>;
  project?: {
    id: string;
    name: string;
  } | null;
  lists?: Array<{
    listId: string;
    list: {
      id: string;
      name: string;
    };
  }>;
}

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  onActionOpen?: (id: string) => void;
}

// Map codebase priority strings to visual severity badge styles.
// Preserves the existing label text so the UI matches stored data.
const PRIORITY_CLASS: Record<string, string> = {
  "1st Priority": styles.priCritical!,
  "2nd Priority": styles.priHigh!,
  "3rd Priority": styles.priMedium!,
  "4th Priority": styles.priLow!,
  "5th Priority": styles.priLow!,
  "Quick": styles.priQuick!,
  "Scheduled": styles.priScheduled!,
  "Errand": styles.priLow!,
  "Remember": styles.priLow!,
  "Watch": styles.priLow!,
  "Someday Maybe": styles.priLow!,
  "Critical": styles.priCritical!,
  "High": styles.priHigh!,
  "Medium": styles.priMedium!,
  "Low": styles.priLow!,
};

// Fallback for the Mantine badge inside the expanded modal (uses Mantine color names).
const MANTINE_PRIORITY_COLOR: Record<string, string> = {
  "1st Priority": "red",
  "2nd Priority": "orange",
  "3rd Priority": "yellow",
  "4th Priority": "gray",
  "5th Priority": "gray",
  "Quick": "cyan",
  "Scheduled": "blue",
  "Critical": "red",
  "High": "orange",
  "Medium": "yellow",
  "Low": "gray",
};

const STATUS_LABEL: Record<ActionStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export function TaskCard({ task, isDragging = false, onActionOpen }: TaskCardProps) {
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [expandedModalOpen, setExpandedModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const { workspaceId } = useWorkspace();
  const utils = api.useUtils();
  const { data: workspaceLists } = api.list.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const addToList = api.list.addAction.useMutation({
    onSettled: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.view.getViewActions.invalidate(),
        utils.list.list.invalidate(),
      ]);
    },
  });

  const removeFromList = api.list.removeAction.useMutation({
    onSettled: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.view.getViewActions.invalidate(),
        utils.list.list.invalidate(),
      ]);
    },
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const priorityClass = PRIORITY_CLASS[task.priority] ?? styles.priLow;
  const statusLabel = task.kanbanStatus ? STATUS_LABEL[task.kanbanStatus] : null;

  const handleCardClick = (e: React.MouseEvent) => {
    // Only open modal if we're not interacting with menus or action buttons
    const target = e.target as HTMLElement;
    if (!target.closest("[data-no-modal]")) {
      e.stopPropagation();
      if (onActionOpen) {
        onActionOpen(task.id);
      } else {
        setEditModalOpen(true);
      }
    }
  };

  const cardClasses = [
    styles.kcard,
    isDragging ? styles.kcardOverlay : "",
    isSortableDragging ? styles.kcardDragging : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cardClasses}
        role="button"
        tabIndex={0}
        aria-describedby={`task-${task.id}-description`}
        aria-label={`Task: ${task.name}. Priority: ${task.priority}. ${
          task.assignees.length > 0 ? `Assigned to ${task.assignees.length} person${task.assignees.length > 1 ? "s" : ""}. ` : ""
        }${task.dueDate ? `Due: ${formatDate(task.dueDate)}. ` : ""}${
          isOverdue ? "Overdue. " : ""
        }Drag to move, or press space to open menu.`}
        onClick={handleCardClick}
      >
        <div className={styles.kcardHead}>
          <div className={styles.kcardTitle}>
            <HTMLContent html={task.name} />
          </div>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <button
                type="button"
                className={styles.kcardMenu}
                aria-label="Open task menu"
                onClick={(e) => e.stopPropagation()}
                data-no-modal
              >
                <IconDots size={13} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconArrowsMaximize size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedModalOpen(true);
                }}
              >
                Expand
              </Menu.Item>
              <Menu.Item
                leftSection={<IconEdit size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditModalOpen(true);
                }}
              >
                Edit
              </Menu.Item>
              <Menu.Item
                onClick={(e) => {
                  e.stopPropagation();
                  setAssignModalOpen(true);
                }}
              >
                Assign
              </Menu.Item>
              <Menu.Divider />
              <Menu.Label>Lists</Menu.Label>
              {workspaceLists?.map((list) => {
                const isInList = task.lists?.some((al) => al.listId === list.id);
                return (
                  <Menu.Item
                    key={list.id}
                    leftSection={<IconList size={14} />}
                    rightSection={isInList ? <IconCheck size={14} /> : null}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isInList) {
                        removeFromList.mutate({ listId: list.id, actionId: task.id });
                      } else {
                        addToList.mutate({ listId: list.id, actionId: task.id });
                      }
                    }}
                  >
                    {list.name}
                  </Menu.Item>
                );
              })}
              {(!workspaceLists || workspaceLists.length === 0) && (
                <Menu.Item disabled>No lists yet</Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconTrash size={16} />}
                color="red"
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>

        {task.description && (
          <div
            id={`task-${task.id}-description`}
            className="text-xs text-text-muted"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <HTMLContent html={task.description} className="text-xs text-text-muted" />
          </div>
        )}

        <div className={styles.kcardMeta}>
          {statusLabel && (
            <span className={styles.typeBadge}>{statusLabel}</span>
          )}
          <span className={`${styles.pri} ${priorityClass}`}>
            {task.priority}
          </span>
          {task.dueDate && (
            <span className={`${styles.dueTag} ${isOverdue ? styles.dueTagOverdue : ""}`}>
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.tags && task.tags.length > 0 && (
            <TagBadgeList
              tags={task.tags.map((t) => t.tag)}
              maxDisplay={2}
              size="xs"
            />
          )}

          {task.assignees.length > 0 && (
            <span className={styles.kcardMetaRight}>
              <Avatar.Group spacing="xs">
                {task.assignees.slice(0, 3).map((assignee) => {
                  const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
                  const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
                  const textColor = backgroundColor ? getTextColor(backgroundColor) : "white";
                  const initial = getInitial(assignee.user.name, assignee.user.email);

                  return (
                    <HoverCard key={assignee.user.id} width={200} shadow="md">
                      <HoverCard.Target>
                        <Avatar
                          size="sm"
                          src={assignee.user.image}
                          alt={assignee.user.name ?? assignee.user.email ?? "User"}
                          radius="xl"
                          className="cursor-pointer"
                          styles={{
                            root: {
                              backgroundColor: backgroundColor,
                              color: textColor,
                              fontWeight: 600,
                              fontSize: "11px",
                            },
                          }}
                        >
                          {!assignee.user.image && initial}
                        </Avatar>
                      </HoverCard.Target>
                      <HoverCard.Dropdown>
                        <Group gap="sm">
                          <Avatar
                            src={assignee.user.image}
                            alt={assignee.user.name ?? assignee.user.email ?? "User"}
                            radius="xl"
                            styles={{
                              root: {
                                backgroundColor: backgroundColor,
                                color: textColor,
                                fontWeight: 600,
                                fontSize: "14px",
                              },
                            }}
                          >
                            {!assignee.user.image && initial}
                          </Avatar>
                          <div>
                            <Text size="sm" fw={500}>
                              {assignee.user.name ?? "Unknown User"}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {assignee.user.email}
                            </Text>
                          </div>
                        </Group>
                      </HoverCard.Dropdown>
                    </HoverCard>
                  );
                })}
                {task.assignees.length > 3 && (
                  <Tooltip label={`${task.assignees.length - 3} more assignees`}>
                    <Avatar
                      size="sm"
                      radius="xl"
                      className="cursor-pointer"
                      color="gray"
                      styles={{
                        root: {
                          backgroundColor: "var(--mantine-color-gray-6)",
                          color: "white",
                          fontWeight: 600,
                        },
                      }}
                    >
                      +{task.assignees.length - 3}
                    </Avatar>
                  </Tooltip>
                )}
              </Avatar.Group>
            </span>
          )}
        </div>

        <AssignActionModal
          opened={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          actionId={task.id}
          actionName={task.name}
          projectId={task.projectId}
          currentAssignees={task.assignees}
        />
      </div>

      {/* Expanded Task Modal */}
      <Modal
        opened={expandedModalOpen}
        onClose={() => setExpandedModalOpen(false)}
        title={
          <Group gap="md" align="center">
            <div className="text-lg font-semibold">
              <HTMLContent html={task.name} className="text-lg font-semibold text-text-primary" />
            </div>
            <Badge
              size="sm"
              variant="light"
              color={MANTINE_PRIORITY_COLOR[task.priority] ?? "gray"}
            >
              {task.priority}
            </Badge>
          </Group>
        }
        size="lg"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        <Stack gap="lg">
          <div>
            <Text size="sm" fw={500} mb="xs" c="dimmed">
              Description
            </Text>
            {task.description ? (
              <div className="text-text-primary">
                <HTMLContent html={task.description} />
              </div>
            ) : (
              <Text size="sm" c="dimmed" fs="italic">
                No description provided
              </Text>
            )}
          </div>

          <Divider />

          <Group justify="space-between" wrap="wrap">
            <Stack gap="xs">
              <Text size="sm" fw={500} c="dimmed">
                Details
              </Text>
              <Group gap="md">
                {task.project && (
                  <div>
                    <Text size="xs" c="dimmed">Project</Text>
                    <Badge size="sm" variant="light" color="blue">
                      {task.project.name}
                    </Badge>
                  </div>
                )}
                {task.dueDate && (
                  <div>
                    <Text size="xs" c="dimmed">Due Date</Text>
                    <Badge
                      size="sm"
                      variant="light"
                      color={isOverdue ? "red" : "gray"}
                    >
                      {formatDate(task.dueDate)}
                    </Badge>
                  </div>
                )}
              </Group>
            </Stack>

            {task.assignees.length > 0 && (
              <Stack gap="xs">
                <Text size="sm" fw={500} c="dimmed">
                  Assigned to
                </Text>
                <Group gap="xs">
                  {task.assignees.map((assignee) => {
                    const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
                    const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
                    const textColor = backgroundColor ? getTextColor(backgroundColor) : "white";
                    const initial = getInitial(assignee.user.name, assignee.user.email);

                    return (
                      <Group key={assignee.user.id} gap="xs" align="center">
                        <Avatar
                          size="sm"
                          src={assignee.user.image}
                          alt={assignee.user.name ?? assignee.user.email ?? "User"}
                          radius="xl"
                          styles={{
                            root: {
                              backgroundColor: backgroundColor,
                              color: textColor,
                              fontWeight: 600,
                              fontSize: "12px",
                            },
                          }}
                        >
                          {!assignee.user.image && initial}
                        </Avatar>
                        <div>
                          <Text size="sm">{assignee.user.name ?? "Unknown User"}</Text>
                          <Text size="xs" c="dimmed">{assignee.user.email}</Text>
                        </div>
                      </Group>
                    );
                  })}
                </Group>
              </Stack>
            )}
          </Group>

          <Divider />

          <Group justify="flex-end">
            <Button
              variant="light"
              leftSection={<IconEdit size={16} />}
              onClick={(e) => {
                e.stopPropagation();
                setExpandedModalOpen(false);
                setEditModalOpen(true);
              }}
            >
              Edit Task
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedModalOpen(false);
                setAssignModalOpen(true);
              }}
            >
              Assign
            </Button>
          </Group>
        </Stack>
      </Modal>

      <EditActionModal
        action={task as any}
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
      />
    </>
  );
}
