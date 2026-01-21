"use client";

import { Modal, Button, Group, TextInput, Select, Text, Textarea, MultiSelect, NumberInput, Stack, ActionIcon, Card, Badge } from '@mantine/core';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { UnifiedDatePicker } from './UnifiedDatePicker';
import { CreateProjectModal } from './CreateProjectModal';
import { CreateOutcomeModal } from './CreateOutcomeModal';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { notifications } from '@mantine/notifications';

// Type for pending key results (not yet saved)
interface PendingKeyResult {
  tempId: string;
  title: string;
  targetValue: number;
  startValue: number;
  unit: 'percent' | 'count' | 'currency' | 'hours' | 'custom';
  unitLabel?: string;
  period: string;
}

// Unit options for key results
const unitOptions = [
  { value: "percent", label: "Percentage (%)" },
  { value: "count", label: "Count (#)" },
  { value: "currency", label: "Currency ($)" },
  { value: "hours", label: "Hours" },
  { value: "custom", label: "Custom" },
];

interface CreateGoalModalProps {
  children?: React.ReactNode;
  goal?: {
    id: number;
    title: string;
    description: string | null;
    whyThisGoal: string | null;
    notes: string | null;
    dueDate: Date | null;
    period: string | null;
    lifeDomainId: number | null;
    outcomes?: { id: string; description: string }[];
    workspaceId?: string | null;
  };
  trigger?: React.ReactNode;
  projectId?: string;
  onSuccess?: (goalId: number) => void; // Callback when goal is created/updated
  onDelete?: () => void; // Callback when goal is deleted
}

export function CreateGoalModal({ children, goal, trigger, projectId, onSuccess, onDelete }: CreateGoalModalProps) {
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
  const [period, setPeriod] = useState<string | null>(goal?.period ?? null);

  // Key results state
  const [pendingKeyResults, setPendingKeyResults] = useState<PendingKeyResult[]>([]);
  const [isAddingKeyResult, setIsAddingKeyResult] = useState(false);
  const [newKrTitle, setNewKrTitle] = useState("");
  const [newKrTargetValue, setNewKrTargetValue] = useState<number>(100);
  const [newKrStartValue, setNewKrStartValue] = useState<number>(0);
  const [newKrUnit, setNewKrUnit] = useState<string>("percent");
  const [newKrUnitLabel, setNewKrUnitLabel] = useState("");
  const [newKrPeriod, setNewKrPeriod] = useState<string>("");
  const [isCreatingKeyResults, setIsCreatingKeyResults] = useState(false);

  const utils = api.useUtils();
  const { data: projects } = api.project.getAll.useQuery();
  const { data: outcomes } = api.outcome.getMyOutcomes.useQuery();
  const { data: workspaces } = api.workspace.list.useQuery();
  const { data: periods } = api.okr.getPeriods.useQuery();
  const { data: existingKeyResults } = api.okr.getAll.useQuery(
    { goalId: goal?.id },
    { enabled: !!goal?.id && opened }
  );

  const { workspaceId: currentWorkspaceId } = useWorkspace();

  // Mutations for key results
  const createKeyResult = api.okr.create.useMutation({
    onSuccess: () => {
      void utils.okr.getAll.invalidate();
      void utils.okr.getByObjective.invalidate();
      void utils.okr.getStats.invalidate();
    },
  });

  const deleteKeyResult = api.okr.delete.useMutation({
    onSuccess: () => {
      void utils.okr.getAll.invalidate();
      void utils.okr.getByObjective.invalidate();
      void utils.okr.getStats.invalidate();
    },
    onError: (error) => {
      console.error('[CreateGoalModal] Failed to delete key result:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete key result. Please try again.',
        color: 'red',
      });
    },
  });

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
          period: newGoal.period ?? null,
          lifeDomainId: newGoal.lifeDomainId ?? null,
          userId: "",
          workspaceId: null,
          lifeDomain: newGoal.lifeDomainId ? {
            id: newGoal.lifeDomainId,
            title: "Loading...",
            description: null,
            icon: null,
            color: null,
            displayOrder: 0,
            isActive: true,
          } : null,
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
    onSuccess: async (newGoal) => {
      // Create pending key results for the new goal
      if (pendingKeyResults.length > 0) {
        await createKeyResultsForGoal(newGoal.id);
      }
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
          period: updatedGoal.period ?? null,
          lifeDomainId: updatedGoal.lifeDomainId ?? null,
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

  const deleteGoal = api.goal.deleteGoal.useMutation({
    onSuccess: () => {
      void utils.goal.getAllMyGoals.invalidate();
      // Also invalidate OKR queries since goals are objectives in the OKR view
      void utils.okr.getByObjective.invalidate();
      void utils.okr.getStats.invalidate();
      void utils.okr.getAvailableGoals.invalidate();
      onDelete?.();
      close();
    },
    onError: (error) => {
      console.error('[CreateGoalModal] Failed to delete goal:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete objective. Please try again.',
        color: 'red',
      });
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setWhyThisGoal("");
    setNotes("");
    setDueDate(null);
    setPeriod(null);
    setLifeDomainId(null);
    setSelectedProjectId(undefined);
    setSelectedOutcomeIds([]);
    setSelectedWorkspaceId(null);
    // Reset key results state
    setPendingKeyResults([]);
    setIsAddingKeyResult(false);
    resetNewKrForm();
  };

  const resetNewKrForm = () => {
    setNewKrTitle("");
    setNewKrTargetValue(100);
    setNewKrStartValue(0);
    setNewKrUnit("percent");
    setNewKrUnitLabel("");
    setNewKrPeriod("");
  };

  const handleAddPendingKeyResult = () => {
    if (!newKrTitle || !newKrPeriod) return;

    const newKr: PendingKeyResult = {
      tempId: crypto.randomUUID(),
      title: newKrTitle,
      targetValue: newKrTargetValue,
      startValue: newKrStartValue,
      unit: newKrUnit as PendingKeyResult['unit'],
      unitLabel: newKrUnit === 'custom' ? newKrUnitLabel : undefined,
      period: newKrPeriod,
    };

    setPendingKeyResults(prev => [...prev, newKr]);
    resetNewKrForm();
    setIsAddingKeyResult(false);
  };

  const handleRemovePendingKeyResult = (tempId: string) => {
    setPendingKeyResults(prev => prev.filter(kr => kr.tempId !== tempId));
  };

  const handleDeleteExistingKeyResult = (id: string) => {
    if (confirm("Delete this key result?")) {
      deleteKeyResult.mutate({ id });
    }
  };

  // Create key results after goal is created
  const createKeyResultsForGoal = async (goalId: number) => {
    if (pendingKeyResults.length === 0) return;

    setIsCreatingKeyResults(true);
    try {
      for (const kr of pendingKeyResults) {
        await createKeyResult.mutateAsync({
          goalId,
          title: kr.title,
          targetValue: kr.targetValue,
          startValue: kr.startValue,
          unit: kr.unit,
          unitLabel: kr.unitLabel,
          period: kr.period,
          workspaceId: selectedWorkspaceId ?? undefined,
        });
      }
    } catch (error) {
      console.error('[CreateGoalModal] Failed to create key results:', error);
      notifications.show({
        title: 'Warning',
        message: 'Goal created but some key results failed to save.',
        color: 'yellow',
      });
    } finally {
      setIsCreatingKeyResults(false);
    }
  };

  // Add key result immediately for existing goals
  const handleAddKeyResultToExistingGoal = async () => {
    if (!goal?.id || !newKrTitle || !newKrPeriod) return;

    try {
      await createKeyResult.mutateAsync({
        goalId: goal.id,
        title: newKrTitle,
        targetValue: newKrTargetValue,
        startValue: newKrStartValue,
        unit: newKrUnit as PendingKeyResult['unit'],
        unitLabel: newKrUnit === 'custom' ? newKrUnitLabel : undefined,
        period: newKrPeriod,
        workspaceId: selectedWorkspaceId ?? undefined,
      });
      resetNewKrForm();
      setIsAddingKeyResult(false);
      notifications.show({
        title: 'Success',
        message: 'Key result added',
        color: 'green',
      });
    } catch (error) {
      console.error('[CreateGoalModal] Failed to add key result:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to add key result. Please try again.',
        color: 'red',
      });
    }
  };

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setWhyThisGoal(goal.whyThisGoal ?? "");
      setNotes(goal.notes ?? "");
      setDueDate(goal.dueDate);
      setPeriod(goal.period ?? null);
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
            if (!title) return;
            
            const goalData = {
              title,
              description: description || undefined,
              whyThisGoal: whyThisGoal || undefined,
              notes: notes || undefined,
              dueDate: dueDate ?? undefined,
              period: period ?? undefined,
              lifeDomainId: lifeDomainId ?? undefined,
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
            placeholder="What's your objective?"
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
            label="Why this objective?"
            placeholder="What makes this objective meaningful to you? How does it align with your values?"
            value={whyThisGoal}
            onChange={(e) => setWhyThisGoal(e.target.value)}
            mt="md"
            minRows={2}
            autosize
          />

          <MultiSelect
            label="Linked Outcomes"
            placeholder="Select outcomes that support this objective"
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

          
          <div className="mt-4">
            <Text size="sm" fw={500} mb={4}>Due date (optional)</Text>
            <UnifiedDatePicker
              value={dueDate}
              onChange={setDueDate}
              notificationContext="goal"
            />
          </div>

          <Select
            label="Period"
            description="The time period for this objective (e.g., Q1 2026 or Annual 2026)"
            placeholder="Select a period"
            data={periods ?? []}
            value={period}
            onChange={(value) => setPeriod(value)}
            clearable
            mt="md"
          />

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
            placeholder="Additional notes about this objective..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            mt="md"
            minRows={3}
            autosize
          />

          {/* Key Results Section */}
          <div className="mt-6 border-t border-border-primary pt-4">
            <Text size="sm" fw={500} mb="sm">Key Results</Text>

            {/* Existing Key Results (edit mode only) */}
            {goal?.id && existingKeyResults && existingKeyResults.length > 0 && (
              <Stack gap="xs" mb="sm">
                {existingKeyResults.map((kr) => (
                  <Card key={kr.id} padding="xs" className="bg-surface-secondary border border-border-primary">
                    <Group justify="space-between" wrap="nowrap">
                      <div className="flex-1 min-w-0">
                        <Text size="sm" fw={500} truncate>{kr.title}</Text>
                        <Group gap="xs">
                          <Badge size="xs" variant="light">
                            {kr.startValue} → {kr.targetValue} {kr.unit === 'percent' ? '%' : kr.unitLabel ?? kr.unit}
                          </Badge>
                          <Badge size="xs" variant="outline">{kr.period}</Badge>
                        </Group>
                      </div>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => handleDeleteExistingKeyResult(kr.id)}
                        loading={deleteKeyResult.isPending}
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            {/* Pending Key Results (create mode only) */}
            {!goal?.id && pendingKeyResults.length > 0 && (
              <Stack gap="xs" mb="sm">
                {pendingKeyResults.map((kr) => (
                  <Card key={kr.tempId} padding="xs" className="bg-surface-secondary border border-border-primary">
                    <Group justify="space-between" wrap="nowrap">
                      <div className="flex-1 min-w-0">
                        <Text size="sm" fw={500} truncate>{kr.title}</Text>
                        <Group gap="xs">
                          <Badge size="xs" variant="light">
                            {kr.startValue} → {kr.targetValue} {kr.unit === 'percent' ? '%' : kr.unitLabel ?? kr.unit}
                          </Badge>
                          <Badge size="xs" variant="outline">{kr.period}</Badge>
                        </Group>
                      </div>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => handleRemovePendingKeyResult(kr.tempId)}
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            {/* Add Key Result Form */}
            {isAddingKeyResult ? (
              <Card padding="sm" className="bg-surface-secondary border border-border-primary">
                <Stack gap="sm">
                  <TextInput
                    placeholder="Key result title (e.g., Increase revenue by 20%)"
                    value={newKrTitle}
                    onChange={(e) => setNewKrTitle(e.target.value)}
                    size="sm"
                  />
                  <Group grow>
                    <NumberInput
                      label="Start"
                      value={newKrStartValue}
                      onChange={(v) => setNewKrStartValue(typeof v === 'number' ? v : 0)}
                      size="sm"
                    />
                    <NumberInput
                      label="Target"
                      value={newKrTargetValue}
                      onChange={(v) => setNewKrTargetValue(typeof v === 'number' ? v : 100)}
                      size="sm"
                    />
                  </Group>
                  <Group grow>
                    <Select
                      label="Unit"
                      data={unitOptions}
                      value={newKrUnit}
                      onChange={(v) => setNewKrUnit(v ?? 'percent')}
                      size="sm"
                    />
                    {newKrUnit === 'custom' && (
                      <TextInput
                        label="Unit label"
                        placeholder="e.g., users"
                        value={newKrUnitLabel}
                        onChange={(e) => setNewKrUnitLabel(e.target.value)}
                        size="sm"
                      />
                    )}
                  </Group>
                  <Select
                    label="Period"
                    placeholder="Select period"
                    data={periods ?? []}
                    value={newKrPeriod}
                    onChange={(v) => setNewKrPeriod(v ?? '')}
                    size="sm"
                    required
                  />
                  <Group justify="flex-end" gap="xs">
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => {
                        setIsAddingKeyResult(false);
                        resetNewKrForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={goal?.id ? handleAddKeyResultToExistingGoal : handleAddPendingKeyResult}
                      disabled={!newKrTitle || !newKrPeriod}
                      loading={createKeyResult.isPending}
                    >
                      {goal?.id ? 'Add' : 'Add to list'}
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ) : (
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => setIsAddingKeyResult(true)}
                className="text-text-secondary hover:text-text-primary"
              >
                Add key result
              </Button>
            )}
          </div>

          {workspaces && workspaces.length > 0 && (
            <Select
              label="Workspace"
              description={goal ? "Move this objective to a different workspace" : "Save this objective to a workspace"}
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
            {goal && (
              <Button
                type="button"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => {
                  if (confirm("Delete this objective? All associated key results will also be deleted.")) {
                    deleteGoal.mutate({ id: goal.id });
                  }
                }}
                loading={deleteGoal.isPending}
                className="mr-auto"
              >
                Delete
              </Button>
            )}
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createGoal.isPending || updateGoal.isPending || isCreatingKeyResults}
              disabled={!title}
            >
              {goal ? 'Update Objective' : 'Create Objective'}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 