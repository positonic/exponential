"use client";

import { Modal, Button, Group, TextInput, Select, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { UnifiedDatePicker } from './UnifiedDatePicker';

interface CreateGoalModalProps {
  children?: React.ReactNode;
  goal?: {
    id: number;
    title: string;
    description: string | null;
    dueDate: Date | null;
    lifeDomainId: number;
  };
  trigger?: React.ReactNode;
  projectId?: string;
}

export function CreateGoalModal({ children, goal, trigger, projectId }: CreateGoalModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [dueDate, setDueDate] = useState<Date | null>(goal?.dueDate ?? null);
  const [lifeDomainId, setLifeDomainId] = useState<number | null>(goal?.lifeDomainId ?? null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId);

  const utils = api.useUtils();
  const { data: lifeDomains } = api.lifeDomain.getAllLifeDomains.useQuery();
  const { data: projects } = api.project.getAll.useQuery();

  const createGoal = api.goal.createGoal.useMutation({
    onMutate: async (newGoal) => {
      await utils.goal.getAllMyGoals.cancel();
      const previousGoals = utils.goal.getAllMyGoals.getData();

      utils.goal.getAllMyGoals.setData(undefined, (old) => {
        const optimisticGoal = {
          id: -1,
          title: newGoal.title,
          description: newGoal.description ?? null,
          dueDate: newGoal.dueDate ?? null,
          lifeDomainId: newGoal.lifeDomainId,
          userId: "",
          lifeDomain: {
            id: newGoal.lifeDomainId,
            title: "Loading...",
            description: null
          },
          projects: [],
          outcomes: []
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
    onSuccess: () => {
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
    onSuccess: () => {
      resetForm();
      close();
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDueDate(null);
    setLifeDomainId(null);
    setSelectedProjectId(undefined);
  };

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setDueDate(goal.dueDate);
      setLifeDomainId(goal.lifeDomainId);
    }
  }, [goal]);

  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

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
              dueDate: dueDate ?? undefined,
              lifeDomainId,
              projectId: selectedProjectId,
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

          <Select
            label="Life Domain"
            data={lifeDomainOptions}
            value={lifeDomainId?.toString()}
            onChange={(value) => setLifeDomainId(value ? parseInt(value) : null)}
            required
            mt="md"
          />
          
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
            mt="md"
          />

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