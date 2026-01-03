"use client";

import { Modal, Button, Group, TextInput, Select, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { DateInput } from '@mantine/dates';

interface CreateOutcomeModalProps {
  children?: React.ReactNode;
  projectId?: string;
  outcome?: {
    id: string;
    description: string;
    dueDate: Date | null;
    type: OutcomeType;
    whyThisOutcome?: string | null;
    projectId?: string;
    goalId?: number;
  };
  trigger?: React.ReactNode; // For clicking on existing outcomes
}

type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

export function CreateOutcomeModal({ children, projectId, outcome, trigger }: CreateOutcomeModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [description, setDescription] = useState(outcome?.description ?? "");
  const [dueDate, setDueDate] = useState<Date | null>(outcome?.dueDate ?? null);
  const [type, setType] = useState<OutcomeType>(outcome?.type ?? "daily");
  const [whyThisOutcome, setWhyThisOutcome] = useState(outcome?.whyThisOutcome ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId ?? outcome?.projectId);
  const [selectedGoalId, setSelectedGoalId] = useState<number | undefined>(outcome?.goalId);

  const utils = api.useUtils();
  const { data: projects } = api.project.getAll.useQuery();
  const { data: goals } = api.goal.getAllMyGoals.useQuery();

  const createOutcome = api.outcome.createOutcome.useMutation({
    onMutate: async (newOutcome) => {
      console.log('🟡 onMutate started', { newOutcome, projectId, selectedProjectId });

      // Cancel any outgoing refetches
      await utils.outcome.getMyOutcomes.cancel();
      if (selectedProjectId) {
        await utils.outcome.getProjectOutcomes.cancel();
      }
      console.log('🟡 Cancelled existing queries');

      // Snapshot the previous value
      const previousData = {
        myOutcomes: utils.outcome.getMyOutcomes.getData(),
        projectOutcomes: selectedProjectId
          ? utils.outcome.getProjectOutcomes.getData({ projectId: selectedProjectId })
          : null
      };
      console.log('🟡 Previous data:', previousData);

      const optimisticOutcome = {
        id: `temp-${Date.now()}`,
        description: newOutcome.description,
        dueDate: newOutcome.dueDate ?? null,
        type: newOutcome.type!,
        userId: "",
        projects: selectedProjectId && projects
          ? [projects.find(p => p.id === selectedProjectId)].filter(Boolean)
          : [],
        goals: selectedGoalId && goals
          ? [goals.find(g => g.id === selectedGoalId)].filter(Boolean)
          : [],
        assignees: []
      };
      console.log('🟡 Created optimistic outcome:', optimisticOutcome);

      // Update all the queries atomically
      utils.outcome.getMyOutcomes.setData(undefined, (old) => {
        if (!old) return [optimisticOutcome as any];
        return [...old, optimisticOutcome as any];
      });

      if (selectedProjectId) {
        utils.outcome.getProjectOutcomes.setData(
          { projectId: selectedProjectId },
          (old) => {
            if (!old) return [optimisticOutcome as any];
            return [...old, optimisticOutcome as any];
          }
        );
      }

      return previousData;
    },

    onError: (error, variables, context) => {
      console.log('🔴 Error occurred:', error);
      console.log('🔴 Rolling back to:', context);
      // Add rollback logic if needed
    },

    onSuccess: async (newOutcome) => {
      console.log('🟢 Mutation succeeded:', newOutcome);
      
      // Immediately update the cache with the new data
      if (selectedProjectId) {
        console.log('🟢 Invalidating project outcomes for:', selectedProjectId);
        await utils.outcome.getProjectOutcomes.invalidate({ projectId: selectedProjectId });
      }
      console.log('🟢 Invalidating all outcomes');
      await utils.outcome.getMyOutcomes.invalidate();
      
      // Reset form and close modal
      setDescription("");
      setDueDate(null);
      setType("daily");
      setSelectedProjectId(undefined);
      close();
    },

    onSettled: () => {
      console.log('🔵 Mutation settled');
    }
  });

  const updateOutcome = api.outcome.updateOutcome.useMutation({
    onMutate: async (updatedOutcome) => {
      console.log('🟡 Update onMutate started', { updatedOutcome, selectedProjectId });

      // Cancel any outgoing refetches
      await utils.outcome.getMyOutcomes.cancel();
      if (selectedProjectId) {
        await utils.outcome.getProjectOutcomes.cancel();
      }

      const previousData = {
        myOutcomes: utils.outcome.getMyOutcomes.getData(),
        projectOutcomes: selectedProjectId
          ? utils.outcome.getProjectOutcomes.getData({ projectId: selectedProjectId })
          : null
      };

      return previousData;
    },

    onSuccess: async (_updatedOutcome) => {
      // Invalidate and refetch immediately
      await Promise.all([
        utils.outcome.getMyOutcomes.invalidate(),
        selectedProjectId ? utils.outcome.getProjectOutcomes.invalidate({ projectId: selectedProjectId }) : Promise.resolve()
      ]);

      // Reset form and close modal
      resetForm();
      close();
    },

    onSettled: async () => {
      // Force a refetch after the mutation is settled
      await utils.outcome.getMyOutcomes.refetch();
      if (selectedProjectId) {
        await utils.outcome.getProjectOutcomes.refetch({ projectId: selectedProjectId });
      }
    }
  });

  const outcomeTypes = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
    { value: 'life', label: 'Life' },
    { value: 'problem', label: 'Problem' }
  ] as const;

  const resetForm = () => {
    setDescription("");
    setDueDate(null);
    setType("daily");
    setWhyThisOutcome("");
    setSelectedProjectId(undefined);
    setSelectedGoalId(undefined);
  };

  // Update the form when the outcome prop changes
  useEffect(() => {
    if (outcome) {
      setDescription(outcome.description);
      setDueDate(outcome.dueDate);
      setType(outcome.type);
      setWhyThisOutcome(outcome.whyThisOutcome ?? "");
      setSelectedProjectId(outcome.projectId);
      setSelectedGoalId(outcome.goalId);
    }
  }, [outcome]);

  // Add this useEffect to update selectedProjectId when projectId prop changes
  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;

    const outcomeData = {
      description,
      dueDate: dueDate ?? undefined,
      type,
      whyThisOutcome: whyThisOutcome || undefined,
      projectId: selectedProjectId,
      goalId: selectedGoalId,
    };

    if (outcome?.id) {
      // Update existing outcome
      updateOutcome.mutate({
        id: outcome.id,
        ...outcomeData,
      });
    } else {
      // Create new outcome
      createOutcome.mutate(outcomeData);
    }
  };

  return (
    <>
      {trigger ? (
        <div onClick={open}>{trigger}</div>
      ) : children ? (
        <div onClick={open}>{children}</div>
      ) : null}

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
          onSubmit={handleSubmit}
          className="p-4"
        >
          <TextInput
            placeholder="What outcome do you want to achieve?"
            variant="unstyled"
            size="xl"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            styles={{
              input: {
                fontSize: '24px',
                color: 'var(--color-text-primary)',
                '&::placeholder': {
                  color: 'var(--color-text-primary)',
                },
              },
            }}
          />

          <Textarea
            label="Why this outcome?"
            placeholder="What makes this outcome meaningful? How does achieving it move you forward?"
            value={whyThisOutcome}
            onChange={(e) => setWhyThisOutcome(e.target.value)}
            mt="md"
            minRows={2}
            autosize
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
            }}
          />

          <Select
            label="Outcome Type"
            data={outcomeTypes}
            value={type}
            onChange={(value) => setType((value ?? "daily") as OutcomeType)}
            required
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
              dropdown: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-primary)',
              },
            }}
          />

          <Select
            label="Which vision goal is this outcome for? (optional)"
            placeholder="Search goals..."
            searchable
            clearable
            data={goals?.map(g => ({ value: String(g.id), label: g.title })) ?? []}
            value={selectedGoalId ? String(selectedGoalId) : null}
            onChange={(value) => setSelectedGoalId(value ? Number(value) : undefined)}
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
              dropdown: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-primary)',
              },
            }}
          />

          <Select
            label="How will you achieve this? (optional)"
            placeholder="Search projects..."
            searchable
            clearable
            data={projects?.map(p => ({ value: p.id, label: p.name })) ?? []}
            value={selectedProjectId ?? null}
            onChange={(value) => setSelectedProjectId(value ?? undefined)}
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
              dropdown: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-primary)',
              },
            }}
          />
          
          <DateInput
            value={dueDate}
            onChange={setDueDate}
            label="Due date (optional)"
            placeholder="Pick a date"
            mt="md"
            highlightToday={true}
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
              
              calendarHeader: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
              },
              monthCell: {
                color: 'var(--color-text-primary)',
              },
              month: {
                color: 'var(--color-text-primary)',
              },
              weekday: {
                color: 'var(--color-text-muted)',
              },
              day: {
                color: 'var(--color-text-primary)',
              },
            }}
          />

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createOutcome.isPending || updateOutcome.isPending}
              disabled={!description}
            >
              {outcome ? 'Update Outcome' : 'Create Outcome'}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 