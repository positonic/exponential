import { Textarea, Button, Group, Select } from '@mantine/core';
import { type ActionPriority, PRIORITY_OPTIONS } from "~/types/action";
import { api } from "~/trpc/react";
import DateWidget from './DateWidget';
import { RichTextInput } from './RichTextInput';

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
            color: '#C1C2C5',
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
            color: '#909296',
            '&::placeholder': {
              color: '#909296',
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
              backgroundColor: '#262626',
              color: '#C1C2C5',
              borderColor: '#373A40',
            },
            dropdown: {
              backgroundColor: '#262626',
              borderColor: '#373A40',
              color: '#C1C2C5',
            },
          }}
        />
        {setDueDate && (
          <DateWidget 
            date={dueDate ?? null}
            setDueDate={setDueDate}
            onClear={() => setDueDate(null)}
          />
        )}
      </Group>

      <div className="border-t border-gray-800 p-4 mt-4">
        <Group justify="space-between">
          <Select
            placeholder="Select a project (optional)"
            variant="unstyled"
            value={projectId}
            onChange={(value) => setProjectId(value ?? undefined)}
            data={projects.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            styles={{
              input: {
                color: '#C1C2C5',
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