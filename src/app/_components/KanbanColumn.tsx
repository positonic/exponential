"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Paper, Stack, Text, Badge, Group } from "@mantine/core";
import { TaskCard } from "./TaskCard";
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

interface KanbanColumnProps {
  id: ActionStatus;
  title: string;
  color: string;
  tasks: Task[];
  dragOverTaskId?: string | null;
}

export function KanbanColumn({ id, title, color, tasks, dragOverTaskId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  const taskIds = tasks.map(task => task.id);

  return (
    <Paper
      ref={setNodeRef}
      className={`min-w-80 w-80 transition-all duration-200 ${
        isOver ? 'ring-2 ring-blue-400 ring-opacity-50 bg-surface-hover' : ''
      }`}
      p="md"
      radius="md"
      withBorder
      role="region"
      aria-label={`${title} column with ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
    >
      <Group justify="space-between" mb="sm">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Group gap="xs">
          <Badge
            size="xs"
            variant="light"
            color={color}
          >
            {tasks.length}
          </Badge>
        </Group>
      </Group>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <Stack gap="sm">
          {tasks.map((task, index) => (
            <div key={task.id}>
              {/* Show insertion indicator when dragging over this task */}
              {dragOverTaskId === task.id && (
                <div className="h-1 bg-blue-400 rounded-full mb-2 opacity-75" />
              )}
              <TaskCard task={task} />
            </div>
          ))}
          {tasks.length === 0 && (
            <div 
              className="h-20 border-2 border-dashed border-border-secondary rounded-md flex items-center justify-center"
              role="region"
              aria-label={`Empty ${title.toLowerCase()} column. Drop tasks here to change their status.`}
            >
              <Text size="sm" c="dimmed">
                Drop tasks here
              </Text>
            </div>
          )}
        </Stack>
      </SortableContext>
    </Paper>
  );
}