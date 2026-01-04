import { Textarea, Button, Group, Select } from '@mantine/core';
import { type ActionPriority, PRIORITY_OPTIONS } from "~/types/action";
import { api } from "~/trpc/react";
import { UnifiedDatePicker } from './UnifiedDatePicker';
import { RichTextInput } from './RichTextInput';
import { AssigneeSelector } from './AssigneeSelector';

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
  selectedAssigneeIds: string[];
  actionId?: string;
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
  selectedAssigneeIds,
  actionId,
  onAssigneeClick,
  onSubmit,
  onClose,
  submitLabel,
  isSubmitting,
}: ActionModalFormProps) {
  const projects = api.project.getAll.useQuery();

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