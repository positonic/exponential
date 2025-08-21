"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, Text, Group, Badge, Avatar, Stack, ActionIcon, Menu, Tooltip, HoverCard, Modal, Button, Divider } from "@mantine/core";
import { IconGripVertical, IconDots, IconEdit, IconTrash, IconArrowsMaximize } from "@tabler/icons-react";
import { AssignTaskModal } from "./AssignTaskModal";
import { EditActionModal } from "./EditActionModal";
import { getAvatarColor, getInitial, getColorSeed, getTextColor } from "~/utils/avatarColors";
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
  project?: {
    id: string;
    name: string;
  } | null;
}

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

// Helper component to render HTML content safely
const HTMLContent = ({ html, className }: { html: string, className?: string }) => (
  <div 
    className={className || "text-text-primary"}
    dangerouslySetInnerHTML={{ __html: html }}
    style={{ display: 'inline' }}
  />
);

const priorityColors: Record<string, string> = {
  "Critical": "red",
  "High": "orange", 
  "Medium": "yellow",
  "Low": "blue",
  "Quick": "gray",
};

export function TaskCard({ task, isDragging = false }: TaskCardProps) {
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [expandedModalOpen, setExpandedModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  
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
    opacity: isDragging || isSortableDragging ? 0.5 : 1,
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  const handleCardClick = (e: React.MouseEvent) => {
    // Only open modal if we're not interacting with drag handles, menus, or action buttons
    const target = e.target as HTMLElement;
    if (!target.closest('[data-dnd-handle]') && !target.closest('[data-no-modal]')) {
      e.stopPropagation();
      setExpandedModalOpen(true);
    }
  };

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`cursor-grab active:cursor-grabbing transition-all duration-200 ${
          isDragging ? 'shadow-lg ring-2 ring-blue-400 ring-opacity-50 scale-105' : 'hover:shadow-md'
        }`}
        p="sm"
        radius="md"
        withBorder
        role="button"
        tabIndex={0}
        aria-describedby={`task-${task.id}-description`}
        aria-label={`Task: ${task.name}. Priority: ${task.priority}. ${
          task.assignees.length > 0 ? `Assigned to ${task.assignees.length} person${task.assignees.length > 1 ? 's' : ''}. ` : ''
        }${task.dueDate ? `Due: ${formatDate(task.dueDate)}. ` : ''}${
          isOverdue ? 'Overdue. ' : ''
        }Drag to move, or press space to open menu.`}
        onClick={handleCardClick}
      >
      <Stack gap="xs">
        {/* Header with drag handle and menu */}
        <Group justify="space-between" wrap="nowrap">
          <div 
            className="p-1 -ml-1"
            aria-label="Drag handle"
            data-dnd-handle
          >
            <IconGripVertical size={16} className="text-text-muted" />
          </div>
          
          <Menu shadow="md" width={150} position="bottom-end">
            <Menu.Target>
              <ActionIcon 
                variant="subtle" 
                size="sm"
                aria-label="Open task menu"
                onClick={(e) => e.stopPropagation()}
                data-no-modal
              >
                <IconDots size={16} />
              </ActionIcon>
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
              <Menu.Item 
                leftSection={<IconTrash size={16} />}
                color="red"
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {/* Task title */}
        <div
          className="text-sm font-medium text-text-primary"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <HTMLContent html={task.name} className="text-sm font-medium text-text-primary" />
        </div>

        {/* Task description */}
        {task.description && (
          <div
            className="text-xs text-text-muted"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            id={`task-${task.id}-description`}
          >
            <HTMLContent html={task.description} className="text-xs text-text-muted" />
          </div>
        )}

        {/* Project badge */}
        {task.project && (
          <Badge size="xs" variant="light" color="blue">
            {task.project.name}
          </Badge>
        )}

        {/* Footer with priority, due date, and assignees */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            {/* Priority badge */}
            <Badge
              size="xs"
              variant="light"
              color={priorityColors[task.priority] || "gray"}
            >
              {task.priority}
            </Badge>

            {/* Due date */}
            {task.dueDate && (
              <Badge
                size="xs"
                variant="light"
                color={isOverdue ? "red" : "gray"}
              >
                {formatDate(task.dueDate)}
              </Badge>
            )}
          </Group>

          {/* Assignee avatars with hover details */}
          {task.assignees.length > 0 && (
            <Avatar.Group spacing="xs">
              {task.assignees.slice(0, 3).map((assignee) => {
                const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
                const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
                const textColor = backgroundColor ? getTextColor(backgroundColor) : 'white';
                const initial = getInitial(assignee.user.name, assignee.user.email);
                
                return (
                  <HoverCard key={assignee.user.id} width={200} shadow="md">
                    <HoverCard.Target>
                      <Avatar
                        size="md"
                        src={assignee.user.image}
                        alt={assignee.user.name || assignee.user.email || 'User'}
                        radius="xl"
                        className="cursor-pointer"
                        styles={{
                          root: {
                            backgroundColor: backgroundColor,
                            color: textColor,
                            fontWeight: 600,
                            fontSize: '14px',
                          }
                        }}
                      >
                        {!assignee.user.image && initial}
                      </Avatar>
                    </HoverCard.Target>
                  <HoverCard.Dropdown>
                    <Group gap="sm">
                      <Avatar
                        src={assignee.user.image}
                        alt={assignee.user.name || assignee.user.email || 'User'}
                        radius="xl"
                        styles={{
                          root: {
                            backgroundColor: backgroundColor,
                            color: textColor,
                            fontWeight: 600,
                            fontSize: '14px',
                          }
                        }}
                      >
                        {!assignee.user.image && initial}
                      </Avatar>
                      <div>
                        <Text size="sm" fw={500}>
                          {assignee.user.name || "Unknown User"}
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
                    size="md" 
                    radius="xl" 
                    className="cursor-pointer"
                    color="gray"
                    styles={{
                      root: {
                        backgroundColor: 'var(--mantine-color-gray-6)',
                        color: 'white',
                        fontWeight: 600,
                      }
                    }}
                  >
                    +{task.assignees.length - 3}
                  </Avatar>
                </Tooltip>
              )}
            </Avatar.Group>
          )}
        </Group>
      </Stack>
      
      <AssignTaskModal
        opened={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        taskId={task.id}
        taskName={task.name}
        projectId={task.projectId}
        currentAssignees={task.assignees}
      />
      </Card>

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
              color={priorityColors[task.priority] || "gray"}
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
          {/* Task Details */}
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

          {/* Metadata */}
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

            {/* Assignees */}
            {task.assignees.length > 0 && (
              <Stack gap="xs">
                <Text size="sm" fw={500} c="dimmed">
                  Assigned to
                </Text>
                <Group gap="xs">
                  {task.assignees.map((assignee) => {
                    const colorSeed = getColorSeed(assignee.user.name, assignee.user.email);
                    const backgroundColor = assignee.user.image ? undefined : getAvatarColor(colorSeed);
                    const textColor = backgroundColor ? getTextColor(backgroundColor) : 'white';
                    const initial = getInitial(assignee.user.name, assignee.user.email);
                    
                    return (
                      <Group key={assignee.user.id} gap="xs" align="center">
                        <Avatar
                          size="sm"
                          src={assignee.user.image}
                          alt={assignee.user.name || assignee.user.email || 'User'}
                          radius="xl"
                          styles={{
                            root: {
                              backgroundColor: backgroundColor,
                              color: textColor,
                              fontWeight: 600,
                              fontSize: '12px',
                            }
                          }}
                        >
                          {!assignee.user.image && initial}
                        </Avatar>
                        <div>
                          <Text size="sm">{assignee.user.name || "Unknown User"}</Text>
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

          {/* Actions */}
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

      {/* Edit Task Modal */}
      <EditActionModal
        action={task}
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
      />
    </>
  );
}