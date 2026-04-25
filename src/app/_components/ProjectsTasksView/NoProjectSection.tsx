'use client';

import { Badge, ActionIcon, Text } from '@mantine/core';
import { IconChevronRight, IconPlus } from '@tabler/icons-react';

interface NoProjectSectionProps {
  taskCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onAddTask: () => void;
}

export function NoProjectSection({
  taskCount,
  isExpanded,
  onToggle,
  onAddTask,
}: NoProjectSectionProps) {
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors border-b border-border-primary bg-surface-tertiary"
      onClick={onToggle}
    >
      {/* Expand/collapse arrow */}
      <IconChevronRight
        size={16}
        className={`text-text-muted transition-transform flex-shrink-0 ${
          isExpanded ? 'rotate-90' : ''
        }`}
      />

      {/* No project indicator */}
      <div className="w-2 h-2 rounded-full bg-text-muted flex-shrink-0" />

      {/* Section name */}
      <Text fw={500} className="text-text-secondary">
        No project
      </Text>

      {/* Type indicator */}
      <Text size="xs" className="text-text-muted">
        (Project)
      </Text>

      {/* Task count badge */}
      <Badge size="sm" variant="light" color="gray">
        {taskCount}
      </Badge>

      {/* Add task button (on hover) */}
      <ActionIcon
        variant="subtle"
        size="sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
        onClick={(e) => {
          e.stopPropagation();
          onAddTask();
        }}
      >
        <IconPlus size={14} />
      </ActionIcon>
    </div>
  );
}
