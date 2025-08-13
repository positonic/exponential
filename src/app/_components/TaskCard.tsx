"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, Text, Group, Badge, Avatar, Stack, ActionIcon, Menu } from "@mantine/core";
import { IconGripVertical, IconDots, IconEdit, IconTrash, IconUser } from "@tabler/icons-react";
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

const priorityColors: Record<string, string> = {
  "Critical": "red",
  "High": "orange", 
  "Medium": "yellow",
  "Low": "blue",
  "Quick": "gray",
};

export function TaskCard({ task, isDragging = false }: TaskCardProps) {
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

  return (
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
    >
      <Stack gap="xs">
        {/* Header with drag handle and menu */}
        <Group justify="space-between" wrap="nowrap">
          <div 
            className="p-1 -ml-1"
            aria-label="Drag handle"
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
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={16} />}>
                Edit
              </Menu.Item>
              <Menu.Item leftSection={<IconUser size={16} />}>
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
        <Text fw={500} size="sm" lineClamp={2}>
          {task.name}
        </Text>

        {/* Task description */}
        {task.description && (
          <Text 
            size="xs" 
            c="dimmed" 
            lineClamp={2}
            id={`task-${task.id}-description`}
          >
            {task.description}
          </Text>
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

          {/* Assignee avatars */}
          {task.assignees.length > 0 && (
            <Avatar.Group spacing="xs">
              {task.assignees.slice(0, 3).map((assignee, index) => (
                <Avatar
                  key={assignee.user.id}
                  size="sm"
                  src={assignee.user.image}
                  alt={assignee.user.name || assignee.user.email || 'User'}
                  radius="xl"
                >
                  {!assignee.user.image && (
                    assignee.user.name?.charAt(0) || 
                    assignee.user.email?.charAt(0) || 
                    '?'
                  )}
                </Avatar>
              ))}
              {task.assignees.length > 3 && (
                <Avatar size="sm" radius="xl">
                  +{task.assignees.length - 3}
                </Avatar>
              )}
            </Avatar.Group>
          )}
        </Group>
      </Stack>
    </Card>
  );
}