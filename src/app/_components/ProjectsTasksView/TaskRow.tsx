'use client';

import { Checkbox, Badge, Text } from '@mantine/core';
import { IconRepeat } from '@tabler/icons-react';
import { DateCell } from './columns/DateCell';
import { DurationCell } from './columns/DurationCell';
import { PriorityBadge, getPriorityBorderColor } from './columns/PriorityBadge';
import { AssigneeAvatar } from './columns/AssigneeAvatar';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Assignee {
  user: User;
}

interface Project {
  id: string;
  name: string;
}

interface ActionData {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  scheduledStart: Date | null;
  completedAt: Date | null;
  duration: number | null;
  timeSpentMins: number | null;
  isRecurring: boolean;
  project?: Project | null;
  assignees: Assignee[];
}

interface TaskRowProps {
  action: ActionData;
  isLastChild: boolean;
  indentLevel?: number;
  onRowClick: () => void;
  onCheckboxChange: (checked: boolean) => void;
}

export function TaskRow({
  action,
  isLastChild,
  indentLevel = 1,
  onRowClick,
  onCheckboxChange,
}: TaskRowProps) {
  const isCompleted = action.status === 'COMPLETED';

  return (
    <div
      className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors border-b border-border-primary"
      onClick={onRowClick}
    >
      {/* NAME column with tree connector */}
      <div className="flex items-center gap-2 flex-1 min-w-[300px]">
        {/* Indentation and tree lines */}
        <div
          className="flex items-center flex-shrink-0"
          style={{ paddingLeft: `${indentLevel * 24}px` }}
        >
          {/* Tree connector */}
          <div className="relative w-5 flex-shrink-0">
            {/* Horizontal line to item */}
            <div className="absolute top-1/2 left-0 w-full h-px bg-border-secondary" />
            {/* Vertical line (hidden bottom half for last child) */}
            <div
              className={`absolute left-0 w-px bg-border-secondary ${
                isLastChild ? 'top-0 h-1/2' : 'top-0 h-full'
              }`}
            />
          </div>
        </div>

        {/* Circular checkbox */}
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            size="md"
            radius="xl"
            checked={isCompleted}
            onChange={(event) => {
              onCheckboxChange(event.currentTarget.checked);
            }}
            styles={{
              input: {
                borderColor: getPriorityBorderColor(action.priority),
                backgroundColor: 'transparent',
                cursor: 'pointer',
              },
            }}
          />
        </div>

        {/* Task name */}
        <Text
          size="sm"
          className={`truncate ${isCompleted ? 'text-text-muted line-through' : 'text-text-primary'}`}
        >
          {action.name}
        </Text>

        {/* Recurring icon */}
        {action.isRecurring && (
          <IconRepeat size={14} className="text-text-muted flex-shrink-0" />
        )}
      </div>

      {/* ETA column */}
      <div className="w-28">
        <DateCell date={action.dueDate} />
      </div>

      {/* ASSIGNEE column */}
      <div className="w-24">
        <AssigneeAvatar assignees={action.assignees} />
      </div>

      {/* PROJECT column */}
      <div className="w-32">
        {action.project ? (
          <Badge size="sm" variant="light" color="blue">
            {action.project.name}
          </Badge>
        ) : (
          <span className="text-text-muted">-</span>
        )}
      </div>

      {/* COMPLETED AT column */}
      <div className="w-32">
        <DateCell date={action.completedAt} />
      </div>

      {/* DURATION column */}
      <div className="w-20">
        <DurationCell minutes={action.duration} />
      </div>

      {/* DEADLINE column */}
      <div className="w-28">
        <DateCell date={action.dueDate} />
      </div>

      {/* COMPLETED column */}
      <div className="w-24">
        <DurationCell minutes={action.timeSpentMins} />
      </div>

      {/* START DATE column */}
      <div className="w-28">
        <DateCell date={action.scheduledStart} />
      </div>

      {/* PRIORITY column */}
      <div className="w-28">
        <PriorityBadge priority={action.priority} />
      </div>
    </div>
  );
}
