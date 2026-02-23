import { Textarea, Button, Group, Select, ActionIcon, Popover, Text, NumberInput, Stack, Switch, Tooltip, Divider, TagsInput, SegmentedControl, TextInput } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { IconPlus, IconClock, IconX, IconRobot, IconAlertCircle, IconInfoCircle, IconCoin } from '@tabler/icons-react';
import { type ActionPriority, PRIORITY_OPTIONS } from "~/types/action";
import type { EffortUnit } from "~/types/effort";
import { api } from "~/trpc/react";
import { DeadlinePicker } from './DeadlinePicker';
import { UnifiedDatePicker } from './UnifiedDatePicker';
import { RichTextInput } from './RichTextInput';
import { AssigneeSelector } from './AssigneeSelector';
import { TagSelector } from './TagSelector';
import { CreateProjectModal } from './CreateProjectModal';
import { SprintSelector } from './SprintSelector';
import { EpicSelector } from './EpicSelector';
import { EffortEstimateInput } from './EffortEstimateInput';
import { DependencyPicker } from './DependencyPicker';
import { useRef, useState } from 'react';
import { useBountiesEnabled } from '~/hooks/useBountiesEnabled';

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
  // Auto-scheduling options
  isAutoScheduled?: boolean;
  setIsAutoScheduled?: (value: boolean) => void;
  isHardDeadline?: boolean;
  setIsHardDeadline?: (value: boolean) => void;
  scheduleId?: string | null;
  setScheduleId?: (value: string | null) => void;
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
  // Sprint, Epic, Effort, Dependencies
  sprintListId?: string | null;
  setSprintListId?: (value: string | null) => void;
  epicId?: string | null;
  setEpicId?: (value: string | null) => void;
  effortEstimate?: number | null;
  setEffortEstimate?: (value: number | null) => void;
  effortUnit?: EffortUnit;
  blockedByIds?: string[];
  setBlockedByIds?: (ids: string[]) => void;
  // Bounty fields
  isBounty?: boolean;
  setIsBounty?: (value: boolean) => void;
  bountyAmount?: number | null;
  setBountyAmount?: (value: number | null) => void;
  bountyToken?: string | null;
  setBountyToken?: (value: string | null) => void;
  bountyDifficulty?: string | null;
  setBountyDifficulty?: (value: string | null) => void;
  bountySkills?: string[];
  setBountySkills?: (value: string[]) => void;
  bountyDeadline?: Date | null;
  setBountyDeadline?: (value: Date | null) => void;
  bountyMaxClaimants?: number;
  setBountyMaxClaimants?: (value: number) => void;
  bountyExternalUrl?: string | null;
  setBountyExternalUrl?: (value: string | null) => void;
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
  isAutoScheduled,
  setIsAutoScheduled,
  isHardDeadline,
  setIsHardDeadline,
  scheduleId,
  setScheduleId,
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
  sprintListId,
  setSprintListId,
  epicId,
  setEpicId,
  effortEstimate,
  setEffortEstimate,
  effortUnit,
  blockedByIds,
  setBlockedByIds,
  isBounty,
  setIsBounty,
  bountyAmount,
  setBountyAmount,
  bountyToken,
  setBountyToken,
  bountyDifficulty,
  setBountyDifficulty,
  bountySkills,
  setBountySkills,
  bountyDeadline,
  setBountyDeadline,
  bountyMaxClaimants,
  setBountyMaxClaimants,
  bountyExternalUrl,
  setBountyExternalUrl,
}: ActionModalFormProps) {
  const projects = api.project.getAll.useQuery();
  const taskSchedules = api.taskSchedule.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId && !!setScheduleId }
  );
  const [schedulePopoverOpened, setSchedulePopoverOpened] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const bountiesEnabled = useBountiesEnabled(projectId);

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

    // Parse the time string and update the date
    // Priority: preserve existing scheduledStart date > use dueDate > use today
    const [hours, minutes] = timeString.split(':').map(Number);
    const baseDate = scheduledStart 
      ? new Date(scheduledStart) 
      : dueDate 
        ? new Date(dueDate) 
        : new Date();
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

      {/* Row 1: Priority and Date/Time controls */}
      <Group gap="md" mt="md" className="flex-wrap">
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

        {/* Date & Scheduling group */}
        <Group gap="sm">
          {/* Date picker - when to DO the task */}
          <UnifiedDatePicker
            value={scheduledStart ?? null}
            onChange={(date) => {
              if (date) {
                // Preserve time if already set, otherwise default to 9 AM
                const existingHours = scheduledStart?.getHours() ?? 9;
                const existingMinutes = scheduledStart?.getMinutes() ?? 0;
                const newDate = new Date(date);
                newDate.setHours(existingHours, existingMinutes, 0, 0);
                setScheduledStart(newDate);
              } else {
                setScheduledStart(null);
              }
            }}
            mode="single"
            notificationContext="task"
          />
          {/* Deadline picker - when the task is DUE */}
          {setDueDate && (
            <DeadlinePicker
              value={dueDate ?? null}
              onChange={setDueDate}
              notificationContext="task"
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
            <Stack gap="sm" p="xs" style={{ minWidth: 280 }}>
              {/* Auto-scheduling toggle */}
              {setIsAutoScheduled && (
                <>
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <IconRobot size={16} className="text-text-muted" />
                      <Text size="sm" fw={500}>Auto-schedule</Text>
                      <Tooltip
                        label="When enabled, AI will automatically find the best time slot based on your calendar and deadlines"
                        multiline
                        w={220}
                      >
                        <IconInfoCircle size={14} className="text-text-muted cursor-help" />
                      </Tooltip>
                    </Group>
                    <Switch
                      checked={isAutoScheduled ?? true}
                      onChange={(e) => setIsAutoScheduled(e.currentTarget.checked)}
                      size="sm"
                    />
                  </Group>

                  {isAutoScheduled && setIsHardDeadline && (
                    <Group justify="space-between" align="center" pl="md">
                      <Group gap="xs">
                        <IconAlertCircle size={14} className="text-text-muted" />
                        <Text size="xs" c="dimmed">Hard deadline</Text>
                        <Tooltip
                          label="If checked, task may be scheduled outside normal work hours to meet the deadline"
                          multiline
                          w={200}
                        >
                          <IconInfoCircle size={12} className="text-text-muted cursor-help" />
                        </Tooltip>
                      </Group>
                      <Switch
                        checked={isHardDeadline ?? false}
                        onChange={(e) => setIsHardDeadline(e.currentTarget.checked)}
                        size="xs"
                      />
                    </Group>
                  )}

                  {isAutoScheduled && setScheduleId && taskSchedules.data && taskSchedules.data.length > 0 && (
                    <Select
                      size="xs"
                      label="Work schedule"
                      placeholder="Default work hours"
                      value={scheduleId ?? null}
                      onChange={(value) => setScheduleId(value)}
                      clearable
                      data={taskSchedules.data.map((s) => ({
                        value: s.id,
                        label: `${s.name} (${s.startTime}-${s.endTime})`,
                      }))}
                      styles={{
                        input: {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-primary)',
                          borderColor: 'var(--color-border-primary)',
                        },
                      }}
                    />
                  )}

                  <Divider my="xs" />
                </>
              )}

              <Text size="sm" fw={500}>
                {isAutoScheduled === false ? 'Manual schedule' : 'Override (optional)'}
              </Text>
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
                disabled={!scheduledStart && !isAutoScheduled}
              >
                Done
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
        </Group>
      </Group>

      {/* Row 2: Tags and Assignees */}
      <Group gap="sm" mt="sm">
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

      {/* Row 3: Sprint, Epic, Effort, Dependencies */}
      {(setSprintListId ?? setEpicId ?? setEffortEstimate ?? setBlockedByIds) && (
        <Group gap="sm" mt="sm">
          {setSprintListId && (
            <SprintSelector
              value={sprintListId ?? null}
              onChange={setSprintListId}
              workspaceId={workspaceId}
            />
          )}
          {setEpicId && (
            <EpicSelector
              value={epicId ?? null}
              onChange={setEpicId}
              workspaceId={workspaceId}
            />
          )}
          {setEffortEstimate && effortUnit && (
            <EffortEstimateInput
              value={effortEstimate ?? null}
              onChange={setEffortEstimate}
              effortUnit={effortUnit}
            />
          )}
          {setBlockedByIds && (
            <DependencyPicker
              selectedIds={blockedByIds ?? []}
              onChange={setBlockedByIds}
              excludeActionId={actionId}
              workspaceId={workspaceId}
            />
          )}
        </Group>
      )}

      {/* Bounty section - only show when setIsBounty is provided and project is public */}
      {setIsBounty && (() => {
        const selectedProjectIsPublic = projects.data?.find(p => p.id === projectId)?.isPublic ?? false;
        if (!selectedProjectIsPublic || !bountiesEnabled) return null;
        return (
          <div className="border-t border-border-primary mt-4 pt-4 px-4">
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <IconCoin size={16} className="text-text-muted" />
                <Text size="sm" fw={500}>Bounty</Text>
              </Group>
              <Switch
                checked={isBounty ?? false}
                onChange={(e) => setIsBounty(e.currentTarget.checked)}
                size="sm"
              />
            </Group>

            {isBounty && (
              <Stack gap="sm" mt="sm">
                <Group gap="sm" grow>
                  {setBountyAmount && (
                    <NumberInput
                      label="Reward amount"
                      placeholder="100"
                      value={bountyAmount ?? ''}
                      onChange={(value) => setBountyAmount(typeof value === 'number' ? value : null)}
                      min={0}
                      decimalScale={2}
                      styles={{
                        input: {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-primary)',
                          borderColor: 'var(--color-border-primary)',
                        },
                        label: { color: 'var(--color-text-secondary)' },
                      }}
                    />
                  )}
                  {setBountyToken && (
                    <Select
                      label="Token"
                      placeholder="Select token"
                      value={bountyToken ?? null}
                      onChange={(value) => setBountyToken(value)}
                      data={[
                        { value: 'USDC', label: 'USDC' },
                        { value: 'ETH', label: 'ETH' },
                        { value: 'SOL', label: 'SOL' },
                        { value: 'MATIC', label: 'MATIC' },
                      ]}
                      styles={{
                        input: {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-primary)',
                          borderColor: 'var(--color-border-primary)',
                        },
                        label: { color: 'var(--color-text-secondary)' },
                        dropdown: {
                          backgroundColor: 'var(--color-surface-secondary)',
                          borderColor: 'var(--color-border-primary)',
                        },
                      }}
                    />
                  )}
                </Group>

                {setBountyDifficulty && (
                  <div>
                    <Text size="sm" mb={4} className="text-text-secondary">Difficulty</Text>
                    <SegmentedControl
                      value={bountyDifficulty ?? 'beginner'}
                      onChange={(value) => setBountyDifficulty(value)}
                      data={[
                        { value: 'beginner', label: 'Beginner' },
                        { value: 'intermediate', label: 'Intermediate' },
                        { value: 'advanced', label: 'Advanced' },
                      ]}
                      size="xs"
                      fullWidth
                    />
                  </div>
                )}

                {setBountySkills && (
                  <TagsInput
                    label="Required skills"
                    placeholder="Type a skill and press Enter"
                    value={bountySkills ?? []}
                    onChange={setBountySkills}
                    styles={{
                      input: {
                        backgroundColor: 'var(--color-surface-secondary)',
                        color: 'var(--color-text-primary)',
                        borderColor: 'var(--color-border-primary)',
                      },
                      label: { color: 'var(--color-text-secondary)' },
                    }}
                  />
                )}

                <Group gap="sm" grow>
                  {setBountyDeadline && (
                    <DateInput
                      label="Deadline"
                      placeholder="Select deadline"
                      value={bountyDeadline ?? null}
                      onChange={setBountyDeadline}
                      clearable
                      minDate={new Date()}
                      styles={{
                        input: {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-primary)',
                          borderColor: 'var(--color-border-primary)',
                        },
                        label: { color: 'var(--color-text-secondary)' },
                      }}
                    />
                  )}
                  {setBountyMaxClaimants && (
                    <NumberInput
                      label="Max claimants"
                      placeholder="1"
                      value={bountyMaxClaimants ?? 1}
                      onChange={(value) => setBountyMaxClaimants(typeof value === 'number' ? value : 1)}
                      min={1}
                      max={100}
                      styles={{
                        input: {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-primary)',
                          borderColor: 'var(--color-border-primary)',
                        },
                        label: { color: 'var(--color-text-secondary)' },
                      }}
                    />
                  )}
                </Group>

                {setBountyExternalUrl && (
                  <TextInput
                    label="External spec URL"
                    placeholder="https://..."
                    value={bountyExternalUrl ?? ''}
                    onChange={(e) => setBountyExternalUrl(e.currentTarget.value || null)}
                    styles={{
                      input: {
                        backgroundColor: 'var(--color-surface-secondary)',
                        color: 'var(--color-text-primary)',
                        borderColor: 'var(--color-border-primary)',
                      },
                      label: { color: 'var(--color-text-secondary)' },
                    }}
                  />
                )}
              </Stack>
            )}
          </div>
        );
      })()}

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