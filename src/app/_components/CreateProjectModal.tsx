import { Modal, TextInput, Textarea, Button, Group, Select, MultiSelect } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Project, Goal, Outcome } from '@prisma/client';
import { useState } from "react";
import { api } from "~/trpc/react";

type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
type ProjectPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

type ProjectWithRelations = Project & {
  goals?: Goal[];
  outcomes?: Outcome[];
};

interface CreateProjectModalProps {
  children: React.ReactNode;
  project?: ProjectWithRelations;
}

export function CreateProjectModal({ children, project }: CreateProjectModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status as ProjectStatus ?? "ACTIVE");
  const [priority, setPriority] = useState<ProjectPriority>(project?.priority as ProjectPriority ?? "NONE");
  const [selectedGoals, setSelectedGoals] = useState<string[]>(project?.goals?.map(g => g.id.toString()) ?? []);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>(project?.outcomes?.map(o => o.id) ?? []);

  const utils = api.useUtils();

  // Fetch goals and outcomes for the select boxes
  const { data: goals } = api.goal.getAllMyGoals.useQuery();
  const { data: outcomes } = api.outcome.getMyOutcomes.useQuery();

  const updateMutation = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
      close();
    },
  });

  const createMutation = api.project.create.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
      close();
    },
  });

  return (
    <>
      <div onClick={open}>
        {children}
      </div>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: {
            backgroundColor: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (project) {
              updateMutation.mutate({
                id: project.id,
                name: projectName,
                description,
                status: status as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED",
                priority: priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
                goalIds: selectedGoals,
                outcomeIds: selectedOutcomes,
              });
            } else {
              createMutation.mutate({
                name: projectName,
                description,
                status,
                priority,
                goalIds: selectedGoals,
                outcomeIds: selectedOutcomes,
              });
            }
          }}
          className="p-4"
        >
          <TextInput
            placeholder="Project name"
            variant="unstyled"
            size="xl"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            required
            styles={{
              input: {
                fontSize: '24px',
                color: 'var(--color-text-primary)',
                '&::placeholder': {
                  color: 'var(--color-text-muted)',
                },
              },
            }}
          />
          
          <Textarea
            placeholder="Project description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
            }}
          />

          <Select
            data={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'ON_HOLD', label: 'On Hold' },
            ]}
            value={status}
            onChange={(value) => setStatus(value as ProjectStatus)}
            required
            mt="md"
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

          <Select
            data={[
              { value: 'NONE', label: 'None' },
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
            ]}
            value={priority}
            onChange={(value) => setPriority(value as ProjectPriority)}
            required
            mt="md"
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

          <MultiSelect
            data={goals?.map(goal => ({ value: goal.id.toString(), label: goal.title })) ?? []}
            value={selectedGoals}
            onChange={setSelectedGoals}
            label="Link to Goals"
            placeholder="Select goals"
            mt="md"
            searchable={true}
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
            }}
          />

          <MultiSelect
            data={outcomes?.map(outcome => ({ value: outcome.id.toString(), label: outcome.description })) ?? []}
            value={selectedOutcomes}
            onChange={setSelectedOutcomes}
            label="Link to Outcomes"
            placeholder="Select outcomes"
            searchable={true}
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
            }}
          />

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={updateMutation.isPending || createMutation.isPending}
            >
              {project ? 'Update Project' : 'Create Project'}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 