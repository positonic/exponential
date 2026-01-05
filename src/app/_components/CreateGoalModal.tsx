"use client";

import { Modal, Button, Group, TextInput, Select, Text, Textarea, MultiSelect } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { UnifiedDatePicker } from './UnifiedDatePicker';
import { CreateProjectModal } from './CreateProjectModal';
import { CreateOutcomeModal } from './CreateOutcomeModal';
import { useWorkspace } from '~/providers/WorkspaceProvider';

interface CreateGoalModalProps {
  children?: React.ReactNode;
  goal?: {
    id: number;
    title: string;
    description: string | null;
    whyThisGoal: string | null;
    notes: string | null;
    dueDate: Date | null;
    lifeDomainId: number;
    outcomes?: { id: string; description: string }[];
    workspaceId?: string | null;
  };
  trigger?: React.ReactNode;
  projectId?: string;
  onSuccess?: (goalId: number) => void; // Callback when goal is created/updated
}

export function CreateGoalModal({ children, goal, trigger, projectId, onSuccess }: CreateGoalModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [whyThisGoal, setWhyThisGoal] = useState(goal?.whyThisGoal ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [dueDate, setDueDate] = useState<Date | null>(goal?.dueDate ?? null);
  const [lifeDomainId, setLifeDomainId] = useState<number | null>(goal?.lifeDomainId ?? null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId);
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<string[]>(
    goal?.outcomes?.map(o => o.id) ?? []
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    goal?.workspaceId ?? null
  );

  const utils = api.useUtils();
  const { data: lifeDomains } = api.lifeDomain.getAllLifeDomains.useQuery();
  const { data: projects } = api.project.getAll.useQuery();
  const { data: outcomes } = api.outcome.getMyOutcomes.useQuery();
  const { data: workspaces } = api.workspace.list.useQuery();

  const { workspace, workspaceId: currentWorkspaceId } = useWorkspace();
  const isPersonalWorkspace = workspace?.type === 'personal';

  // Find Career/Business domain ID for non-personal workspaces
  const careerDomainId = lifeDomains?.find(d => d.title === 'Career/Business')?.id ?? null;

  const createGoal = api.goal.createGoal.useMutation({
    onMutate: async (newGoal) => {
      await utils.goal.getAllMyGoals.cancel();
      const previousGoals = utils.goal.getAllMyGoals.getData();

      utils.goal.getAllMyGoals.setData(undefined, (old) => {
        const optimisticGoal = {
          id: -1,
          title: newGoal.title,
          description: newGoal.description ?? null,
          whyThisGoal: newGoal.whyThisGoal ?? null,
          notes: newGoal.notes ?? null,
          dueDate: newGoal.dueDate ?? null,
          lifeDomainId: newGoal.lifeDomainId,
          userId: "",
          workspaceId: null,
          lifeDomain: {
            id: newGoal.lifeDomainId,
            title: "Loading...",
            description: null,
            icon: null,
            color: null,
            displayOrder: 0,
            isActive: true,
          },
          projects: [],
          outcomes: [],
          habits: [],
        };
        return old ? [...old, optimisticGoal] : [optimisticGoal];
      });

      return { previousGoals };
    },
    onError: (err, newGoal, context) => {
      if (context?.previousGoals) {
        utils.goal.getAllMyGoals.setData(undefined, context.previousGoals);
      }
    },
    onSettled: () => {
      void utils.goal.getAllMyGoals.invalidate();
      // Also invalidate project-specific goals if a project was selected
      if (selectedProjectId) {
        void utils.goal.getProjectGoals.invalidate({ projectId: selectedProjectId });
      }
    },
    onSuccess: (newGoal) => {
      onSuccess?.(newGoal.id);
      resetForm();
      close();
    },
  });

  const updateGoal = api.goal.updateGoal.useMutation({
    onMutate: async (updatedGoal) => {
      await utils.goal.getAllMyGoals.cancel();
      const previousGoals = utils.goal.getAllMyGoals.getData();

      utils.goal.getAllMyGoals.setData(undefined, (old) => {
        if (!old) return old;
        return old.map(g => g.id === updatedGoal.id ? {
          ...g,
          title: updatedGoal.title,
          description: updatedGoal.description ?? null,
          whyThisGoal: updatedGoal.whyThisGoal ?? null,
          notes: updatedGoal.notes ?? null,
          dueDate: updatedGoal.dueDate ?? null,
          lifeDomainId: updatedGoal.lifeDomainId,
        } : g);
      });

      return { previousGoals };
    },
    onError: (err, newGoal, context) => {
      if (context?.previousGoals) {
        utils.goal.getAllMyGoals.setData(undefined, context.previousGoals);
      }
    },
    onSettled: () => {
      void utils.goal.getAllMyGoals.invalidate();
    },
    onSuccess: (updatedGoal) => {
      onSuccess?.(updatedGoal.id);
      resetForm();
      close();
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setWhyThisGoal("");
    setNotes("");
    setDueDate(null);
    setLifeDomainId(null);
    setSelectedProjectId(undefined);
    setSelectedOutcomeIds([]);
    setSelectedWorkspaceId(null);
  };

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setWhyThisGoal(goal.whyThisGoal ?? "");
      setNotes(goal.notes ?? "");
      setDueDate(goal.dueDate);
      setLifeDomainId(goal.lifeDomainId);
      setSelectedOutcomeIds(goal.outcomes?.map(o => o.id) ?? []);
      setSelectedWorkspaceId(goal.workspaceId ?? null);
    }
  }, [goal]);

  // Auto-set workspace when creating (not editing)
  useEffect(() => {
    if (!goal && currentWorkspaceId && selectedWorkspaceId === null) {
      setSelectedWorkspaceId(currentWorkspaceId);
    }
  }, [goal, currentWorkspaceId, selectedWorkspaceId]);

  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  // Auto-set Career/Business domain for non-personal workspaces
  useEffect(() => {
    if (!isPersonalWorkspace && careerDomainId && !lifeDomainId) {
      setLifeDomainId(careerDomainId);
    }
  }, [isPersonalWorkspace, careerDomainId, lifeDomainId]);

  const lifeDomainOptions = lifeDomains?.map(domain => ({
    value: domain.id.toString(),
    label: domain.title
  })) ?? [];

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
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title || !lifeDomainId) return;
            
            const goalData = {
              title,
              description: description || undefined,
              whyThisGoal: whyThisGoal || undefined,
              notes: notes || undefined,
              dueDate: dueDate ?? undefined,
              lifeDomainId,
              projectId: selectedProjectId,
              outcomeIds: selectedOutcomeIds.length > 0 ? selectedOutcomeIds : undefined,
              workspaceId: selectedWorkspaceId ?? undefined,
            };

            if (goal?.id) {
              updateGoal.mutate({
                id: goal.id,
                ...goalData,
              });
            } else {
              createGoal.mutate(goalData);
            }
          }}
          className="p-4"
        >
          <TextInput
            placeholder="What's your goal?"
            variant="unstyled"
            size="xl"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            styles={{
              input: {
                fontSize: '24px',
              },
            }}
          />
          
          <TextInput
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            mt="md"
          />

          <Textarea
            label="Why this value goal?"
            placeholder="What makes this goal meaningful to you? How does it align with your values?"
            value={whyThisGoal}
            onChange={(e) => setWhyThisGoal(e.target.value)}
            mt="md"
            minRows={2}
            autosize
          />

          <MultiSelect
            label="Goal Outcomes"
            placeholder="Select outcomes that support this goal"
            data={outcomes?.map(o => ({ value: o.id, label: o.description })) ?? []}
            value={selectedOutcomeIds}
            onChange={setSelectedOutcomeIds}
            searchable
            clearable
            mt="md"
          />
          <CreateOutcomeModal onSuccess={(id) => setSelectedOutcomeIds(prev => [...prev, id])}>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
              mt={4}
              className="text-text-secondary hover:text-text-primary"
            >
              Create outcome
            </Button>
          </CreateOutcomeModal>

          {isPersonalWorkspace && (
            <Select
              label="Life Domain"
              data={lifeDomainOptions}
              value={lifeDomainId?.toString()}
              onChange={(value) => setLifeDomainId(value ? parseInt(value) : null)}
              required
              mt="md"
            />
          )}
          
          <div className="mt-4">
            <Text size="sm" fw={500} mb={4}>Due date (optional)</Text>
            <UnifiedDatePicker
              value={dueDate}
              onChange={setDueDate}
              notificationContext="goal"
            />
          </div>

          <Select
            label="Project (optional)"
            placeholder="Select a project"
            data={projects?.map(p => ({ value: p.id, label: p.name })) ?? []}
            value={selectedProjectId}
            onChange={(value) => setSelectedProjectId(value ?? undefined)}
            searchable
            clearable
            mt="md"
          />
          <CreateProjectModal>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
              mt={4}
              className="text-text-secondary hover:text-text-primary"
            >
              Add new project
            </Button>
          </CreateProjectModal>

          <Textarea
            label="Notes"
            placeholder="Additional notes about this goal..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            mt="md"
            minRows={3}
            autosize
          />

          {goal && workspaces && workspaces.length > 0 && (
            <Select
              label="Workspace"
              description="Move this goal to a different workspace"
              data={[
                { value: '', label: 'No Workspace (Personal)' },
                ...workspaces.map(ws => ({ value: ws.id, label: ws.name }))
              ]}
              value={selectedWorkspaceId ?? ''}
              onChange={(value) => setSelectedWorkspaceId(value === '' ? null : value)}
              mt="md"
            />
          )}

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createGoal.isPending || updateGoal.isPending}
              disabled={!title || !lifeDomainId}
            >
              {goal ? 'Update Goal' : 'Create Goal'}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 