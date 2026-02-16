import { Modal, TextInput, Textarea, Button, Group, Select, MultiSelect, Tooltip, Stack, Title, Text, Alert, Loader, Switch } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertCircle, IconBrandNotion, IconCheck, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useDisclosure } from '@mantine/hooks';
import type { Project, Goal, Outcome } from '@prisma/client';
import { useState, useEffect } from "react";
import { useSession } from 'next-auth/react';
import { api } from "~/trpc/react";
import { CreateGoalModal } from './CreateGoalModal';
import { notifications } from '@mantine/notifications';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import type { ProjectStatus, ProjectPriority } from '~/types/project';

type ProjectWithRelations = Project & {
  goals?: Goal[];
  outcomes?: Outcome[];
  lifeDomains?: { id: number; title: string }[];
  workspaceId?: string | null;
  driId?: string | null;
  dri?: { id: string; name: string | null; email: string | null; image: string | null } | null;
};

interface CreateProjectModalProps {
  children: React.ReactNode;
  project?: Partial<ProjectWithRelations> & { id: string; name: string };
  prefillName?: string;
  prefillNotionProjectId?: string;
  onClose?: () => void;
  onSuccess?: (project: Project) => void;
}

export function CreateProjectModal({ children, project, prefillName, prefillNotionProjectId, onClose, onSuccess }: CreateProjectModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [projectName, setProjectName] = useState(project?.name ?? prefillName ?? "");
  const [notionProjectId] = useState(prefillNotionProjectId);
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status as ProjectStatus ?? "ACTIVE");
  const [priority, setPriority] = useState<ProjectPriority>(project?.priority as ProjectPriority ?? "NONE");
  const [selectedGoals, setSelectedGoals] = useState<string[]>(project?.goals?.map(g => g.id.toString()) ?? []);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>(project?.outcomes?.map(o => o.id) ?? []);
  const [selectedLifeDomainIds, setSelectedLifeDomainIds] = useState<string[]>(project?.lifeDomains?.map(d => d.id.toString()) ?? []);
  const [goalSearchValue, setGoalSearchValue] = useState("");
  const [outcomeSearchValue, setOutcomeSearchValue] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(project?.workspaceId ?? null);
  const [selectedDriId, setSelectedDriId] = useState<string | null>(project?.driId ?? null);
  const [startDate, setStartDate] = useState<Date | null>(project?.startDate ?? null);
  const [endDate, setEndDate] = useState<Date | null>(project?.endDate ?? null);
  const [isPublic, setIsPublic] = useState(project?.isPublic ?? false);

  // Get current workspace context for new projects
  const { workspaceId: currentWorkspaceId, workspaceSlug } = useWorkspace();

  // Fetch all workspaces the user belongs to
  const { data: workspaces } = api.workspace.list.useQuery();

  // Set workspace to current workspace when creating a new project
  useEffect(() => {
    if (!project && currentWorkspaceId) {
      setSelectedWorkspaceId(currentWorkspaceId);
    }
  }, [project, currentWorkspaceId]);

  // Multi-step flow state for Notion imports
  const [step, setStep] = useState<'create' | 'workflow' | 'success'>('create');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdProjectSlug, setCreatedProjectSlug] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [syncStrategy, setSyncStrategy] = useState<string>('notion_canonical');
  const [syncedTaskCount, setSyncedTaskCount] = useState<number>(0);

  const { data: session } = useSession();
  const utils = api.useUtils();

  // Check if user is the project owner (can edit status/priority)
  const isOwner = !project || project.createdById === session?.user?.id;
  const cannotEditMessage = "Only the project owner can change this field";

  // Fetch goals and outcomes for the select boxes
  const { data: goals } = api.goal.getAllMyGoals.useQuery();
  const { data: outcomes } = api.outcome.getMyOutcomes.useQuery();
  const { data: lifeDomains } = api.lifeDomain.getAllLifeDomains.useQuery();

  // Fetch workflows for Notion imports (only when we have a prefillNotionProjectId)
  const { data: workflows = [] } = api.workflow.list.useQuery(undefined, {
    enabled: !!prefillNotionProjectId,
  });
  const notionWorkflows = workflows.filter(w => w.provider === 'notion');

  const updateMutation = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
      handleClose();
    },
  });

  const createMutation = api.project.create.useMutation({
    onSuccess: (data) => {
      void utils.project.getAll.invalidate();

      // Call onSuccess callback with the created project
      onSuccess?.(data);

      // If this is a Notion import and workflows exist, show workflow step
      if (prefillNotionProjectId && notionWorkflows.length > 0) {
        setCreatedProjectId(data.id);
        setCreatedProjectSlug(data.slug);
        setStep('workflow');
        // Auto-select if only one workflow
        if (notionWorkflows.length === 1 && notionWorkflows[0]) {
          setSelectedWorkflowId(notionWorkflows[0].id);
        }
      } else {
        handleClose();
        onClose?.();
      }
    },
  });

  // Mutations for workflow configuration (Notion import step 2)
  const updateTaskManagement = api.project.updateTaskManagement.useMutation({
    onError: (error) => {
      notifications.show({
        title: 'Configuration Failed',
        message: error.message ?? 'Failed to configure Notion sync',
        color: 'red',
      });
    },
  });

  const runWorkflow = api.workflow.run.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Sync Complete',
        message: `Imported ${data.itemsCreated} tasks from Notion`,
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Sync Failed',
        message: error.message ?? 'Failed to sync with Notion',
        color: 'red',
      });
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

  // Reset all modal state when closing
  const handleClose = () => {
    // Reset step/workflow state
    setStep('create');
    setCreatedProjectId(null);
    setCreatedProjectSlug(null);
    setSelectedWorkflowId('');
    setSyncStrategy('notion_canonical');
    setSyncedTaskCount(0);
    
    // Reset form fields to defaults (only if not editing an existing project)
    if (!project) {
      setProjectName(prefillName ?? "");
      setDescription("");
      setStatus("ACTIVE");
      setPriority("NONE");
      setSelectedGoals([]);
      setSelectedOutcomes([]);
      setSelectedLifeDomainIds([]);
      setGoalSearchValue("");
      setOutcomeSearchValue("");
      setSelectedWorkspaceId(currentWorkspaceId ?? null);
      setSelectedDriId(null);
      setStartDate(null);
      setEndDate(null);
      setIsPublic(false);
    }
    
    close();
  };

  // Handler for skipping workflow configuration
  const handleSkip = () => {
    handleClose();
    onClose?.();
    notifications.show({
      title: 'Project Created',
      message: 'You can configure Notion sync later in project settings.',
      color: 'blue',
    });
  };

  // Handler for configuring workflow and running initial sync
  const handleConfigureWorkflow = async () => {
    if (!createdProjectId || !selectedWorkflowId) return;

    const workflow = notionWorkflows.find(w => w.id === selectedWorkflowId);
    if (!workflow) return;

    try {
      // 1. Save task management config
      const workflowConfig = workflow.config as Record<string, unknown> | null;
      const databaseId = typeof workflowConfig?.databaseId === 'string' ? workflowConfig.databaseId : '';

      await updateTaskManagement.mutateAsync({
        id: createdProjectId,
        taskManagementTool: 'notion',
        taskManagementConfig: {
          workflowId: selectedWorkflowId,
          databaseId,
          syncStrategy: syncStrategy as 'notion_canonical' | 'manual' | 'auto_pull_then_push',
          conflictResolution: 'local_wins',
          deletionBehavior: 'mark_deleted',
        },
      });

      // 2. Trigger initial sync
      const syncResult = await runWorkflow.mutateAsync({ id: selectedWorkflowId, projectId: createdProjectId });
      setSyncedTaskCount(syncResult.itemsCreated);

      // 3. Show success step
      setStep('success');
    } catch {
      // Errors are handled by the mutation onError handlers
    }
  };

  // Handler for closing success modal and navigating
  const handleSuccessClose = () => {
    handleClose();
    onClose?.();
  };

  return (
    <>
      <div onClick={open}>
        {children}
      </div>

      <Modal
        opened={opened}
        onClose={handleClose}
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
        {/* Step 1: Create Project Form */}
        {step === 'create' && (
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
                lifeDomainIds: selectedLifeDomainIds.map(id => parseInt(id)),
                workspaceId: selectedWorkspaceId,
                driId: selectedDriId,
                startDate: startDate,
                endDate: endDate,
                isPublic,
              });
            } else {
              createMutation.mutate({
                name: projectName,
                description,
                status,
                priority,
                goalIds: selectedGoals,
                outcomeIds: selectedOutcomes,
                lifeDomainIds: selectedLifeDomainIds.map(id => parseInt(id)),
                notionProjectId: notionProjectId ?? undefined,
                workspaceId: selectedWorkspaceId ?? undefined,
                driId: selectedDriId,
                startDate: startDate ?? undefined,
                endDate: endDate ?? undefined,
                isPublic,
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

          <Group grow mt="md" align="flex-start">
            <DateInput
              label="Start date"
              placeholder="Select start date"
              value={startDate}
              onChange={setStartDate}
              clearable
              styles={{
                input: {
                  backgroundColor: 'var(--color-surface-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border-primary)',
                },
              }}
            />
            <DateInput
              label="End date"
              placeholder="Select end date"
              value={endDate}
              onChange={setEndDate}
              clearable
              styles={{
                input: {
                  backgroundColor: 'var(--color-surface-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border-primary)',
                },
              }}
            />
          </Group>

          <Tooltip
            label={cannotEditMessage}
            disabled={isOwner}
            position="top-start"
            withArrow
          >
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
              disabled={!isOwner}
              label="Status"
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
          </Tooltip>

          <Tooltip
            label={cannotEditMessage}
            disabled={isOwner}
            position="top-start"
            withArrow
          >
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
              disabled={!isOwner}
              label="Priority"
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
          </Tooltip>

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
            }}
          />
          <CreateGoalModal onSuccess={(goalId) => setSelectedGoals(prev => [...prev, goalId.toString()])}>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
              mt={4}
              className="text-text-secondary hover:text-text-primary"
            >
              Create new goal
            </Button>
          </CreateGoalModal>

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
            }}
          />

          <MultiSelect
            data={lifeDomains?.map(domain => ({
              value: domain.id.toString(),
              label: domain.title
            })) ?? []}
            value={selectedLifeDomainIds}
            onChange={setSelectedLifeDomainIds}
            label="Life Domains (optional)"
            placeholder="Select life domains this project relates to"
            searchable
            clearable
            maxDropdownHeight={300}
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
            }}
          />

          {/* Workspace selector - show when editing to allow moving between workspaces */}
          {project && workspaces && workspaces.length > 0 && (
            <Select
              data={[
                { value: '', label: 'No Workspace (Personal)' },
                ...workspaces.map(ws => ({
                  value: ws.id,
                  label: ws.name
                }))
              ]}
              value={selectedWorkspaceId ?? ''}
              onChange={(value) => setSelectedWorkspaceId(value === '' ? null : value)}
              label="Workspace"
              description="Move this project to a different workspace"
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
          )}

          {/* DRI (Directly Responsible Individual) selector */}
          {(() => {
            // Get members from the selected workspace or current workspace
            const activeWorkspaceId = selectedWorkspaceId ?? currentWorkspaceId;
            const activeWorkspace = workspaces?.find(ws => ws.id === activeWorkspaceId);
            const workspaceMembers = activeWorkspace?.members ?? [];

            if (workspaceMembers.length > 0) {
              return (
                <Select
                  data={[
                    { value: '', label: 'No DRI assigned' },
                    ...workspaceMembers.map(member => ({
                      value: member.user.id,
                      label: member.user.name ?? member.user.email ?? 'Unknown user'
                    }))
                  ]}
                  value={selectedDriId ?? ''}
                  onChange={(value) => setSelectedDriId(value === '' ? null : value)}
                  label="DRI (Directly Responsible Individual)"
                  description="The person accountable for this project"
                  mt="md"
                  searchable
                  clearable
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
              );
            }
            return null;
          })()}

          {/* Public project toggle - only owner can change */}
          <Tooltip
            label={cannotEditMessage}
            disabled={isOwner}
            position="top-start"
            withArrow
          >
            <div>
              <Switch
                label="Public project"
                description="Allow any user to view this project and create actions"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.currentTarget.checked)}
                disabled={!isOwner}
                mt="md"
                styles={{
                  label: { color: 'var(--color-text-primary)' },
                  description: { color: 'var(--color-text-secondary)' },
                }}
              />
            </div>
          </Tooltip>

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={handleClose}>
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
        )}

        {/* Step 2: Workflow Configuration (only for Notion imports) */}
        {step === 'workflow' && (
          <Stack gap="md" className="p-4">
            <Group gap="sm">
              <IconBrandNotion size={24} />
              <Title order={3}>Configure Notion Sync</Title>
            </Group>

            <Text size="sm" c="dimmed">
              Choose which Notion workflow to use for syncing tasks with this project.
            </Text>

            {notionWorkflows.length === 0 ? (
              <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                No Notion workflows configured. You can set this up later in project settings.
              </Alert>
            ) : (
              <>
                <Select
                  label="Notion Workflow"
                  placeholder="Select a workflow"
                  description="This workflow will be used to sync tasks between this project and Notion"
                  data={notionWorkflows.map(w => ({
                    value: w.id,
                    label: w.name,
                  }))}
                  value={selectedWorkflowId}
                  onChange={(v) => setSelectedWorkflowId(v ?? '')}
                  required
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
                  }}
                />

                <Select
                  label="Sync Strategy"
                  description="How should syncing between your app and Notion work?"
                  data={[
                    { value: 'notion_canonical', label: 'Notion Canonical - Notion is source of truth (recommended)' },
                    { value: 'auto_pull_then_push', label: 'Smart Sync - Pull from Notion first, then push' },
                    { value: 'manual', label: 'Manual - Sync only when clicking sync button' },
                  ]}
                  value={syncStrategy}
                  onChange={(v) => setSyncStrategy(v ?? 'notion_canonical')}
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
                  }}
                />
              </>
            )}

            <Group justify="flex-end" mt="xl">
              <Button variant="subtle" color="gray" onClick={handleSkip}>
                Skip for Now
              </Button>
              <Button
                onClick={handleConfigureWorkflow}
                loading={updateTaskManagement.isPending || runWorkflow.isPending}
                disabled={!selectedWorkflowId}
                leftSection={runWorkflow.isPending ? <Loader size={14} /> : undefined}
              >
                {runWorkflow.isPending ? 'Syncing...' : 'Configure & Sync'}
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 3: Success (after Notion sync completes) */}
        {step === 'success' && (
          <Stack gap="md" className="p-6" align="center">
            <div className="rounded-full bg-green-500/20 p-4">
              <IconCheck size={48} className="text-green-500" />
            </div>

            <Title order={3} ta="center">Project Created Successfully!</Title>

            <Text size="sm" c="dimmed" ta="center">
              Your project has been created and configured with Notion sync.
              {syncedTaskCount > 0 && (
                <Text component="span" fw={500} c="green">
                  {' '}{syncedTaskCount} task{syncedTaskCount !== 1 ? 's' : ''} imported from Notion.
                </Text>
              )}
            </Text>

            <Group justify="center" mt="lg" gap="md">
              <Button variant="subtle" color="gray" onClick={handleSuccessClose}>
                Close
              </Button>
              {createdProjectSlug && createdProjectId && (
                <Button
                  component={Link}
                  href={workspaceSlug
                    ? `/w/${workspaceSlug}/projects/${createdProjectSlug}-${createdProjectId}`
                    : `/projects/${createdProjectSlug}-${createdProjectId}`
                  }
                  onClick={handleSuccessClose}
                >
                  View Project
                </Button>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
} 