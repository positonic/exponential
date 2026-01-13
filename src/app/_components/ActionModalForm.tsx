import { Textarea, Button, Group, Select, ActionIcon, Popover, Text, NumberInput, Stack } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { IconPlus, IconClock, IconX } from '@tabler/icons-react';
import { type ActionPriority, PRIORITY_OPTIONS } from "~/types/action";
import { api } from "~/trpc/react";
import { UnifiedDatePicker } from './UnifiedDatePicker';
import { RichTextInput } from './RichTextInput';
import { AssigneeSelector } from './AssigneeSelector';
import { TagSelector } from './TagSelector';
import { CreateProjectModal } from './CreateProjectModal';
import { useRef, useState } from 'react';

interface ActionModalFormProps {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  priority: ActionPriority;
  setPriority: (value: ActionPriority) => void;
  projectId: string | undefined;
  setProjectId: (value: string | undefined) => void;
  dueDate: Date | null;
  setDueDate: (value: Date | null) => void;
  scheduledStart: Date | null;
  setScheduledStart: (value: Date | null) => void;
  duration: number | null;
  setDuration: (value: number | null) => void;
  selectedAssigneeIds: string[];
  selectedTagIds: string[];
  onTagChange: (tagIds: string[]) => void;
  actionId?: string;
  workspaceId?: string;
  onAssigneeClick: () => void;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}

export function ActionModalForm({
  name,
  setName,
  description,
  setDescription,
  priority,
  setPriority,
  projectId,
  setProjectId,
  dueDate,
  setDueDate,
  scheduledStart,
  setScheduledStart,
  duration,
  setDuration,
  selectedAssigneeIds,
  selectedTagIds,
  onTagChange,
  actionId,
  workspaceId,
  onAssigneeClick,
  onSubmit,
  onClose,
  submitLabel,
  isSubmitting,
}: ActionModalFormProps) {
  const projects = api.project.getAll.useQuery();
  const [schedulePopoverOpened, setSchedulePopoverOpened] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Format scheduled time for display
  const formatScheduledTime = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Handle time input change
  const handleTimeChange = (timeString: string) => {
    if (!timeString) {
      setScheduledStart(null);
      return;
    }

    // Parse the time string and create a date for today (or dueDate if set)
    const [hours, minutes] = timeString.split(':').map(Number);
    const baseDate = dueDate ? new Date(dueDate) : new Date();
    baseDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    setScheduledStart(baseDate);
  };

  // Get time string from scheduledStart for the input
  const getTimeValue = (): string => {
    if (!scheduledStart) return '';
    const hours = scheduledStart.getHours().toString().padStart(2, '0');
    const minutes = scheduledStart.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="p-4"
    >
      <RichTextInput
        value={name}
        onChange={setName}
        placeholder="Task name"
        styles={{
          input: {
            fontSize: '24px',
            color: 'var(--color-text-primary)',
          },
          wrapper: {
            width: '100%',
          }
        }}
      />
      
      <Textarea
        placeholder="Description"
        variant="unstyled"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        styles={{
          input: {
            color: 'var(--color-text-secondary)',
            '&::placeholder': {
              color: 'var(--color-text-muted)',
            },
          },
          wrapper: {
            width: '100%',
          }
        }}
      />

      <Group gap="xs" mt="md" className="flex-wrap">
        <Select
          placeholder="Priority"
          value={priority ?? '5th Priority'}
          onChange={(value) => setPriority(value as ActionPriority)}
          data={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
          className="w-full sm:w-auto"
          styles={{
            input: {
              backgroundColor: 'var(--color-surface-secondary)',
              color: 'var(--color-text-primary)',
              borderColor: 'var(--color-border-primary)',
            },
            dropdown: {
              backgroundColor: 'var(--color-surface-secondary)',
              borderColor: 'var(--color-border-primary)',
              color: 'var(--color-text-primary)',
            },
          }}
        />
        {setDueDate && (
          <UnifiedDatePicker
            value={dueDate ?? null}
            onChange={setDueDate}
            mode="single"
            notificationContext="task"
            onClear={() => setDueDate(null)}
          />
        )}
        {/* Schedule Time Picker */}
        <Popover
          opened={schedulePopoverOpened}
          onChange={setSchedulePopoverOpened}
          position="bottom"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <Button
              variant={scheduledStart ? "light" : "subtle"}
              color={scheduledStart ? "blue" : "gray"}
              size="sm"
              leftSection={<IconClock size={16} />}
              rightSection={scheduledStart ? (
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setScheduledStart(null);
                    setDuration(null);
                  }}
                >
                  <IconX size={12} />
                </ActionIcon>
              ) : undefined}
              onClick={() => setSchedulePopoverOpened(true)}
            >
              {scheduledStart ? formatScheduledTime(scheduledStart) : 'Schedule'}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm" p="xs">
              <Text size="sm" fw={500}>Schedule for today</Text>
              <TimeInput
                ref={timeInputRef}
                label="Start time"
                value={getTimeValue()}
                onChange={(e) => handleTimeChange(e.currentTarget.value)}
                styles={{
                  input: {
                    backgroundColor: 'var(--color-surface-secondary)',
                    color: 'var(--color-text-primary)',
                    borderColor: 'var(--color-border-primary)',
                  },
                }}
              />
              <NumberInput
                label="Duration (minutes)"
                value={duration ?? ''}
                onChange={(value) => setDuration(typeof value === 'number' ? value : null)}
                min={5}
                max={480}
                step={15}
                placeholder="30"
                styles={{
                  input: {
                    backgroundColor: 'var(--color-surface-secondary)',
                    color: 'var(--color-text-primary)',
                    borderColor: 'var(--color-border-primary)',
                  },
                }}
              />
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={() => { handleTimeChange('09:00'); setDuration(30); }}>9 AM</Button>
                <Button size="xs" variant="light" onClick={() => { handleTimeChange('12:00'); setDuration(60); }}>12 PM</Button>
                <Button size="xs" variant="light" onClick={() => { handleTimeChange('14:00'); setDuration(30); }}>2 PM</Button>
                <Button size="xs" variant="light" onClick={() => { handleTimeChange('17:00'); setDuration(30); }}>5 PM</Button>
              </Group>
              <Button
                size="sm"
                onClick={() => setSchedulePopoverOpened(false)}
                disabled={!scheduledStart}
              >
                Done
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
        <TagSelector
          selectedTagIds={selectedTagIds}
          onChange={onTagChange}
          workspaceId={workspaceId}
        />
        {actionId && (
          <AssigneeSelector
            selectedAssigneeIds={selectedAssigneeIds}
            actionId={actionId}
            onAssigneeClick={onAssigneeClick}
          />
        )}
      </Group>

      <div className="border-t border-border-primary p-4 mt-4">
        <Group justify="space-between">
          <Group gap="xs">
            <Select
              placeholder="Select a project (optional)"
              variant="unstyled"
              value={projectId}
              searchable
              onChange={(value) => setProjectId(value ?? undefined)}
              data={projects.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
              styles={{
                input: {
                  color: 'var(--color-text-primary)',
                },
              }}
            />
            <CreateProjectModal onSuccess={(project) => setProjectId(project.id)}>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label="Create new project"
                className="text-text-muted hover:text-text-primary"
              >
                <IconPlus size={16} />
              </ActionIcon>
            </CreateProjectModal>
          </Group>
          <Group>
            <Button variant="subtle" color="gray" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={isSubmitting}
            >
              {submitLabel}
            </Button>
          </Group>
        </Group>
      </div>
    </form>
  );
} 