import { Modal, TextInput, Textarea, Button, Group, Select, MultiSelect } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Project, Goal, Outcome } from '@prisma/client';
import { useState } from "react";
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

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
  const [goalSearchValue, setGoalSearchValue] = useState("");
  const [outcomeSearchValue, setOutcomeSearchValue] = useState("");

  const utils = api.useUtils();

  // Fetch goals and outcomes for the select boxes
  const { data: goals } = api.goal.getAllMyGoals.useQuery();
  const { data: outcomes } = api.outcome.getMyOutcomes.useQuery();
  const { data: lifeDomains } = api.lifeDomain.getAllLifeDomains.useQuery();

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

  const createGoalMutation = api.goal.createGoal.useMutation({
    onSuccess: (newGoal) => {
      void utils.goal.getAllMyGoals.invalidate();
      // Add the new goal to selected goals
      setSelectedGoals(prev => [...prev, newGoal.id.toString()]);
      setGoalSearchValue(""); // Clear search after creation
      notifications.show({
        title: 'Goal created',
        message: `Successfully created goal: ${newGoal.title}`,
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to create goal',
        message: error.message,
        color: 'red',
      });
    },
  });

  const createOutcomeMutation = api.outcome.createOutcome.useMutation({
    onSuccess: (newOutcome) => {
      void utils.outcome.getMyOutcomes.invalidate();
      // Add the new outcome to selected outcomes
      setSelectedOutcomes(prev => [...prev, newOutcome.id]);
      setOutcomeSearchValue(""); // Clear search after creation
      notifications.show({
        title: 'Outcome created',
        message: `Successfully created outcome: ${newOutcome.description}`,
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to create outcome',
        message: error.message,
        color: 'red',
      });
    },
  });

  // Build goal data with create option
  const goalData = goals?.map(goal => ({ 
    value: goal.id.toString(), 
    label: goal.title 
  })) ?? [];

  // Add create option if there's a search value
  if (goalSearchValue.trim()) {
    goalData.push({
      value: `create-${goalSearchValue}`,
      label: `➕ Create new goal: "${goalSearchValue}"`,
    });
  }

  // Build outcome data with create option
  const outcomeData = outcomes?.map(outcome => ({ 
    value: outcome.id.toString(), 
    label: outcome.description 
  })) ?? [];

  // Add create option if there's a search value
  if (outcomeSearchValue.trim()) {
    outcomeData.push({
      value: `create-${outcomeSearchValue}`,
      label: `➕ Create new outcome: "${outcomeSearchValue}"`,
    });
  }

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
            data={goalData}
            value={selectedGoals}
            onChange={(values) => {
              // Check if a create option was selected
              const createValue = values.find(v => v.startsWith('create-'));
              if (createValue) {
                const goalTitle = createValue.replace('create-', '');
                const defaultLifeDomain = lifeDomains?.[0];
                if (defaultLifeDomain) {
                  createGoalMutation.mutate({
                    title: goalTitle,
                    lifeDomainId: defaultLifeDomain.id,
                  });
                  // Remove the create option from selection
                  setSelectedGoals(values.filter(v => !v.startsWith('create-')));
                } else {
                  notifications.show({
                    title: 'Cannot create goal',
                    message: 'No life domains available. Please create a life domain first.',
                    color: 'red',
                  });
                  setSelectedGoals(values.filter(v => !v.startsWith('create-')));
                }
              } else {
                setSelectedGoals(values);
              }
            }}
            onSearchChange={setGoalSearchValue}
            searchValue={goalSearchValue}
            label="Link to Goals"
            placeholder="Select or create goals"
            mt="md"
            searchable
            clearable
            maxDropdownHeight={300}
            nothingFoundMessage="Type to create a new goal"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              dropdown: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
              },
              option: {
                // Style for dropdown items
                '&[data-selected]': {
                  '&, &:hover': {
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-primary)',
                  },
                },
                // Special style for create option
                '&[value^="create-"]': {
                  fontWeight: 600,
                  borderTop: '1px solid var(--color-border-primary)',
                  marginTop: '4px',
                  paddingTop: '8px',
                  backgroundColor: 'var(--color-surface-hover)',
                  '&:hover': {
                    backgroundColor: 'var(--color-brand-surface)',
                  },
                },
              },
            }}
          />

          <MultiSelect
            data={outcomeData}
            value={selectedOutcomes}
            onChange={(values) => {
              // Check if a create option was selected
              const createValue = values.find(v => v.startsWith('create-'));
              if (createValue) {
                const outcomeDescription = createValue.replace('create-', '');
                createOutcomeMutation.mutate({
                  description: outcomeDescription,
                  type: 'weekly', // Default to weekly for project outcomes
                });
                // Remove the create option from selection
                setSelectedOutcomes(values.filter(v => !v.startsWith('create-')));
              } else {
                setSelectedOutcomes(values);
              }
            }}
            onSearchChange={setOutcomeSearchValue}
            searchValue={outcomeSearchValue}
            label="Link to Outcomes"
            placeholder="Select or create outcomes"
            searchable
            clearable
            maxDropdownHeight={300}
            nothingFoundMessage="Type to create a new outcome"
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
              },
              option: {
                // Style for dropdown items
                '&[data-selected]': {
                  '&, &:hover': {
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-primary)',
                  },
                },
                // Special style for create option
                '&[value^="create-"]': {
                  fontWeight: 600,
                  borderTop: '1px solid var(--color-border-primary)',
                  marginTop: '4px',
                  paddingTop: '8px',
                  backgroundColor: 'var(--color-surface-hover)',
                  '&:hover': {
                    backgroundColor: 'var(--color-brand-surface)',
                  },
                },
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