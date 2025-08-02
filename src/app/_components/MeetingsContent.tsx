"use client";

import { useState } from "react";
import {
  Group,
  Tabs,
  Title,
  Paper,
  Stack,
  Text,
  Badge,
  Select,
  Button,
  Card,
  Checkbox,
  MultiSelect,
  Menu,
  Modal,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import {
  IconMicrophone,
  IconClipboardList,
  IconCalendar,
  IconCalendarEvent,
  IconFilter,
  IconCheck,
  IconChecks,
  IconSquare,
  IconDotsVertical,
  IconFolder,
  IconTrash,
} from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { ActionList } from "./ActionList";
import { FirefliesSyncPanel } from "./FirefliesSyncPanel";
import { TranscriptionDetailsDrawer } from "./TranscriptionDetailsDrawer";

type TabValue = "transcriptions" | "upcoming" | "archive";

export function MeetingsContent() {
  // Add CSS animation for fade effect
  const fadeAnimationStyles = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(-5px); }
      10% { opacity: 1; transform: translateY(0); }
      90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-5px); }
    }
  `;

  // Add styles to document if not already present
  if (typeof document !== 'undefined' && !document.getElementById('fade-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'fade-animation-styles';
    style.textContent = fadeAnimationStyles;
    document.head.appendChild(style);
  }
  const [activeTab, setActiveTab] = useState<TabValue>("transcriptions");
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState<any>(null);
  const [successMessages, setSuccessMessages] = useState<Record<string, string>>({}); // transcriptionId -> message
  const [syncingToIntegration, setSyncingToIntegration] = useState<string | null>(null); // transcriptionId being synced to external integration
  
  // New state for filtering and bulk operations
  const [selectedIntegrationFilter, setSelectedIntegrationFilter] = useState<string[]>([]);
  const [selectedTranscriptionIds, setSelectedTranscriptionIds] = useState<Set<string>>(new Set());
  const [bulkProjectAssignment, setBulkProjectAssignment] = useState<string | null>(null);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  
  const { data: transcriptions, isLoading } = api.transcription.getAllTranscriptions.useQuery();
  const { data: projects } = api.project.getAll.useQuery();
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const utils = api.useUtils();
  
  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onSuccess: () => {
      // Refetch transcriptions to update the UI
      void utils.transcription.getAllTranscriptions.invalidate();
      notifications.show({
        title: 'Project Assigned',
        message: 'Transcription and its actions have been assigned to the project',
        color: 'green',
      });
    },
  });

  const bulkAssignProjectMutation = api.transcription.bulkAssignProject.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Assignment Complete',
        message: `Assigned ${data.count} transcriptions and their actions to project`,
        color: 'green',
      });
      // Clear selections and refresh data
      setSelectedTranscriptionIds(new Set());
      setBulkProjectAssignment(null);
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Bulk Assignment Failed',
        message: error.message || 'Failed to assign transcriptions to project',
        color: 'red',
      });
    },
  });

  const bulkDeleteMutation = api.transcription.bulkDeleteTranscriptions.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Delete Complete',
        message: `Deleted ${data.count} transcriptions`,
        color: 'green',
      });
      // Clear selections and refresh data
      setSelectedTranscriptionIds(new Set());
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: 'Bulk Delete Failed',
        message: error.message || 'Failed to delete transcriptions',
        color: 'red',
      });
    },
  });


  const syncToIntegrationMutation = api.workflow.run.useMutation({
    onSuccess: (data, variables) => {
      const workflowId = variables.id;
      setSyncingToIntegration(null);
      
      // Find the workflow to get the provider name
      const workflow = workflows.find(w => w.id === workflowId);
      const providerName = workflow?.provider === 'monday' ? 'Monday.com' : 
                          workflow?.provider === 'notion' ? 'Notion' : 
                          workflow?.provider;
      
      const message = `Successfully synced ${data.itemsCreated} actions to ${providerName}`;
      
      // Set success message
      setSuccessMessages(prev => ({ ...prev, [`sync-${workflowId}`]: message }));
      
      // Fade out the message after 3 seconds
      setTimeout(() => {
        setSuccessMessages(prev => {
          const newMessages = { ...prev };
          delete newMessages[`sync-${workflowId}`];
          return newMessages;
        });
      }, 3000);
    },
    onError: (error, variables) => {
      setSyncingToIntegration(null);
      
      // Find the workflow to get the provider name for error message
      const workflowId = variables.id;
      const workflow = workflows.find(w => w.id === workflowId);
      const providerName = workflow?.provider === 'monday' ? 'Monday.com' : 
                          workflow?.provider === 'notion' ? 'Notion' : 
                          workflow?.provider;
      
      notifications.show({
        title: `${providerName} Sync Failed`,
        message: error.message || `Failed to sync to ${providerName}`,
        color: 'red',
      });
    },
  });

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value as TabValue);
    }
  };

  const handleTranscriptionClick = (transcription: any) => {
    setSelectedTranscription(transcription);
    setDrawerOpened(true);
  };

  const handleProjectAssignment = (transcriptionId: string, projectId: string | null) => {
    assignProjectMutation.mutate({ transcriptionId, projectId });
  };


  const handleSyncToIntegration = (session: any) => {
    if (!session.project || !session.project.taskManagementTool || session.project.taskManagementTool === 'internal') {
      notifications.show({
        title: 'Configuration Error',
        message: 'Project is not configured to use an external task management tool',
        color: 'orange',
      });
      return;
    }

    const toolName = session.project.taskManagementTool === 'monday' ? 'Monday.com' : 
                    session.project.taskManagementTool === 'notion' ? 'Notion' : 
                    session.project.taskManagementTool;

    // Get the workflow ID from project configuration
    const workflowId = session.project.taskManagementConfig?.workflowId;
    if (!workflowId) {
      notifications.show({
        title: 'Configuration Missing',
        message: `No ${toolName} workflow configured for this project. Please configure it in project settings.`,
        color: 'orange',
      });
      return;
    }

    // Verify the workflow exists and is active
    const workflow = workflows.find(w => 
      w.id === workflowId && 
      w.provider === session.project.taskManagementTool && 
      w.status === 'ACTIVE'
    );

    if (!workflow) {
      notifications.show({
        title: 'Workflow Not Found',
        message: `The configured ${toolName} workflow is no longer available or active.`,
        color: 'orange',
      });
      return;
    }

    setSyncingToIntegration(session.id);
    syncToIntegrationMutation.mutate({ id: workflowId });
  };

  // Helper functions for bulk operations
  const handleSelectAll = () => {
    const filteredTranscriptions = getFilteredTranscriptions();
    setSelectedTranscriptionIds(new Set(filteredTranscriptions.map(t => t.id)));
  };

  const handleSelectNone = () => {
    setSelectedTranscriptionIds(new Set());
  };

  const handleBulkProjectAssignment = async () => {
    if (selectedTranscriptionIds.size === 0 || !bulkProjectAssignment) return;
    
    await bulkAssignProjectMutation.mutateAsync({
      transcriptionIds: Array.from(selectedTranscriptionIds),
      projectId: bulkProjectAssignment === "none" ? null : bulkProjectAssignment,
    });
  };

  const handleBulkDelete = async () => {
    if (selectedTranscriptionIds.size === 0) return;
    
    await bulkDeleteMutation.mutateAsync({
      ids: Array.from(selectedTranscriptionIds),
    });
    setDeleteModalOpened(false);
  };

  const getFilteredTranscriptions = () => {
    if (!transcriptions) return [];
    
    let filtered = transcriptions;
    
    // Filter by integration
    if (selectedIntegrationFilter.length > 0) {
      filtered = filtered.filter(session => 
        session.sourceIntegration && 
        selectedIntegrationFilter.includes(session.sourceIntegration.id)
      );
    }
    
    return filtered;
  };

  // Get unique integrations for filter options
  const integrationOptions = transcriptions 
    ? Array.from(new Set(
        transcriptions
          .filter(t => t.sourceIntegration)
          .map(t => ({
            value: t.sourceIntegration!.id,
            label: `${t.sourceIntegration!.name} (${t.sourceIntegration!.provider})`
          }))
          .map(item => JSON.stringify(item))
      )).map(item => JSON.parse(item))
    : [];


  if (isLoading) {
    return <div>Loading transcriptions...</div>;
  }

  return (
    <>
      {/* Page Title */}
      <Paper className="w-full max-w-3xl pl-8" px={0} bg="transparent" mb="xl">
        <Title
          order={2}
          mb={4}
          className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent"
        >
          Meetings
        </Title>
        <Text size="sm" c="dimmed">
          Manage your meeting transcriptions and recordings
        </Text>
      </Paper>

      {/* Main Content */}
      <div className="w-full max-w-3xl">
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Stack gap="xl" align="stretch" justify="flex-start">
            {/* Tabs Navigation */}
            <Tabs.List>
              <Tabs.Tab
                value="transcriptions"
                leftSection={<IconMicrophone size={16} />}
              >
                Transcriptions
              </Tabs.Tab>
              <Tabs.Tab
                value="upcoming"
                leftSection={<IconCalendar size={16} />}
              >
                Upcoming
              </Tabs.Tab>
              <Tabs.Tab
                value="archive"
                leftSection={<IconClipboardList size={16} />}
              >
                Archive
              </Tabs.Tab>
            </Tabs.List>

            {/* Content Area */}
            <Tabs.Panel value="transcriptions">
              <Stack gap="md">
                {/* Fireflies Sync Panel */}
                <FirefliesSyncPanel 
                  onSyncComplete={() => {
                    // Refresh transcriptions when sync completes
                    void utils.transcription.getAllTranscriptions.invalidate();
                  }}
                />

                <Group justify="space-between" align="center">
                  <Title order={4}>Recent Meetings</Title>
                  <Text size="sm" c="dimmed">
                    {getFilteredTranscriptions().length} of {transcriptions?.length || 0} meetings
                  </Text>
                </Group>

                {/* Filter and Bulk Operations Bar */}
                <Paper withBorder p="md" radius="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="md">
                      {/* Integration Filter */}
                      <MultiSelect
                        placeholder="Filter by integration"
                        data={integrationOptions}
                        value={selectedIntegrationFilter}
                        onChange={setSelectedIntegrationFilter}
                        leftSection={<IconFilter size={16} />}
                        clearable
                        searchable
                        size="sm"
                        style={{ minWidth: 200 }}
                      />

                      {/* Selection Info */}
                      {selectedTranscriptionIds.size > 0 && (
                        <Badge variant="filled" color="blue">
                          {selectedTranscriptionIds.size} selected
                        </Badge>
                      )}
                    </Group>

                    <Group gap="xs">
                      {/* Select All/None */}
                      <Button
                        size="xs"
                        variant="light"
                        onClick={handleSelectAll}
                        leftSection={<IconChecks size={14} />}
                      >
                        Select All
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={handleSelectNone}
                        leftSection={<IconSquare size={14} />}
                      >
                        Select None
                      </Button>

                      {/* Bulk Actions Menu */}
                      {selectedTranscriptionIds.size > 0 && (
                        <Menu shadow="md">
                          <Menu.Target>
                            <Button
                              size="xs"
                              variant="filled"
                              rightSection={<IconDotsVertical size={14} />}
                            >
                              Bulk Actions
                            </Button>
                          </Menu.Target>

                          <Menu.Dropdown>
                            <Menu.Label>Project Assignment</Menu.Label>
                            <Menu.Item
                              leftSection={<IconFolder size={14} />}
                              onClick={() => {
                                const projectId = window.prompt('Enter project ID or leave empty to unassign:');
                                if (projectId !== null) {
                                  setBulkProjectAssignment(projectId || "none");
                                  handleBulkProjectAssignment();
                                }
                              }}
                            >
                              Assign to Project
                            </Menu.Item>
                            <Menu.Divider />
                            {projects?.map(project => (
                              <Menu.Item
                                key={project.id}
                                onClick={() => {
                                  setBulkProjectAssignment(project.id);
                                  handleBulkProjectAssignment();
                                }}
                              >
                                📁 {project.name}
                              </Menu.Item>
                            ))}
                            <Menu.Divider />
                            <Menu.Item
                              color="gray"
                              onClick={() => {
                                setBulkProjectAssignment("none");
                                handleBulkProjectAssignment();
                              }}
                            >
                              Remove from Project
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={14} />}
                              onClick={() => setDeleteModalOpened(true)}
                            >
                              Delete Transcriptions
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Group>
                  </Group>
                </Paper>
                
                {getFilteredTranscriptions().length > 0 ? (
                  <Stack gap="lg">
                    {getFilteredTranscriptions().map((session) => (
                      <Card
                        key={session.id}
                        withBorder
                        shadow="sm"
                        radius="md"
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleTranscriptionClick(session)}
                      >
                        <Stack gap="md">
                          {/* Meeting Header */}
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            {/* Checkbox for bulk selection */}
                            <Checkbox
                              checked={selectedTranscriptionIds.has(session.id)}
                              onChange={(event) => {
                                const newSelected = new Set(selectedTranscriptionIds);
                                if (event.currentTarget.checked) {
                                  newSelected.add(session.id);
                                } else {
                                  newSelected.delete(session.id);
                                }
                                setSelectedTranscriptionIds(newSelected);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div style={{ flex: 1 }}>
                              <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap="xs" style={{ flex: 1 }}>
                                  <Group gap="sm" wrap="nowrap">
                                    <Text size="lg" fw={600} lineClamp={1}>
                                      {session.title || `Meeting ${session.sessionId}`}
                                    </Text>
                                    <Group gap="xs">
                                      {session.sourceIntegration && (
                                        <Badge variant="dot" color="teal" size="sm">
                                          {session.sourceIntegration.provider}
                                        </Badge>
                                      )}
                                    </Group>
                                  </Group>
                                  
                                  <Group gap="md" c="dimmed">
                                    <Text size="sm">
                                      {new Date(session.createdAt).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </Text>
                                    <Text size="sm">
                                      {new Date(session.createdAt).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </Text>
                                    {session.actions && session.actions.length > 0 && (
                                      <>
                                        <Text size="sm">•</Text>
                                        <Text size="sm">
                                          {session.actions.length} {session.actions.length === 1 ? 'action' : 'actions'}
                                        </Text>
                                      </>
                                    )}
                                  </Group>
                                </Stack>
                                
                                <Select
                                  placeholder="Assign to project"
                                  value={session.projectId || ''}
                                  onChange={(value) => handleProjectAssignment(session.id, value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={(e) => e.stopPropagation()}
                                  data={[
                                    { value: "", label: "No project" },
                                    ...(projects?.map((p) => ({
                                      value: p.id,
                                      label: p.name,
                                    })) || []),
                                  ]}
                                  size="sm"
                                  style={{ minWidth: 200 }}
                                />
                              </Group>
                            </div>
                          </Group>

                          {/* Project Badge */}
                          {session.project && (
                            <Group>
                              <Badge variant="light" color="blue" size="md" leftSection="📁">
                                {session.project.name}
                              </Badge>
                            </Group>
                          )}

                          {/* Meeting Preview */}
                          {session.transcription && (
                            <Paper p="sm" radius="sm" className="bg-gray-50 dark:bg-gray-800">
                              <TranscriptionRenderer
                                transcription={session.transcription}
                                provider={session.sourceIntegration?.provider}
                                isPreview={true}
                                maxLines={3}
                              />
                            </Paper>
                          )}

                          {/* Actions Summary */}
                          {session.actions && session.actions.length > 0 && (
                            <Paper p="sm" radius="sm" withBorder>
                              <Group justify="space-between" align="center">
                                <Group gap="xs">
                                  <Text size="sm" fw={500} c="dimmed">
                                    Action Items:
                                  </Text>
                                  <Badge variant="filled" color="blue" size="sm">
                                    {session.actions.length}
                                  </Badge>
                                </Group>
                                
                                <Group gap="xs">
                                  {/* Sync to Integration Button */}
                                  {session.project && session.project.taskManagementTool && session.project.taskManagementTool !== 'internal' && session.actions && session.actions.length > 0 && (
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color={session.project.taskManagementTool === 'monday' ? 'orange' : 
                                             session.project.taskManagementTool === 'notion' ? 'gray' : 'blue'}
                                      loading={syncingToIntegration === session.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSyncToIntegration(session);
                                      }}
                                      leftSection={<IconCalendarEvent size={12} />}
                                    >
                                      Sync to {session.project.taskManagementTool === 'monday' ? 'Monday.com' : 
                                               session.project.taskManagementTool === 'notion' ? 'Notion' : 
                                               session.project.taskManagementTool}
                                    </Button>
                                  )}
                                  
                                  {/* Success Messages for Sync */}
                                  {session.project?.taskManagementConfig && (session.project.taskManagementConfig as any)?.workflowId && successMessages[`sync-${(session.project.taskManagementConfig as any).workflowId}`] && syncingToIntegration !== session.id && (
                                    <Text size="xs" c="green" fw={500}>
                                      {successMessages[`sync-${(session.project.taskManagementConfig as any).workflowId}`]}
                                    </Text>
                                  )}
                                </Group>
                              </Group>
                              
                              {/* Action Items Preview */}
                              <Stack gap="xs" mt="xs">
                                {session.actions.slice(0, 3).map((action: any) => (
                                  <Group key={action.id} gap="xs" align="flex-start">
                                    <Text size="xs" c="dimmed" mt={2}>•</Text>
                                    <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                                      {action.name}
                                    </Text>
                                    {action.priority && (
                                      <Badge variant="outline" size="xs" color="gray">
                                        {action.priority}
                                      </Badge>
                                    )}
                                  </Group>
                                ))}
                                {session.actions.length > 3 && (
                                  <Text size="xs" c="dimmed" fs="italic">
                                    +{session.actions.length - 3} more actions...
                                  </Text>
                                )}
                              </Stack>
                            </Paper>
                          )}
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Paper p="xl" radius="md" className="text-center">
                    <Stack gap="md" align="center">
                      <Text size="lg" c="dimmed">No meetings found</Text>
                      <Text size="sm" c="dimmed">
                        Meeting transcriptions will appear here once they are processed
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="upcoming">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No upcoming meetings scheduled.
                </Text>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="archive">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No archived meetings.
                </Text>
              </Paper>
            </Tabs.Panel>
          </Stack>
        </Tabs>
      </div>

      {/* Transcription Details Drawer */}
      <TranscriptionDetailsDrawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        transcription={selectedTranscription}
        workflows={workflows}
        onSyncToIntegration={(workflowId) => {
          setSyncingToIntegration(selectedTranscription?.id || null);
          syncToIntegrationMutation.mutate(
            { id: workflowId },
            {
              onSuccess: (data) => {
                notifications.update({
                  id: 'notion-sync',
                  title: 'Success!',
                  message: `Successfully sent ${data.itemsCreated} actions to Notion`,
                  color: 'green',
                  loading: false,
                });
                // Clear the loading state
                setSyncingToIntegration(null);
              },
              onError: (error) => {
                notifications.update({
                  id: 'notion-sync',
                  title: 'Failed to send to Notion',
                  message: error.message || 'An error occurred while sending actions to Notion',
                  color: 'red',
                  loading: false,
                });
                setSyncingToIntegration(null);
              },
            }
          );
        }}
        syncingToIntegration={syncingToIntegration}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete Transcriptions"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete {selectedTranscriptionIds.size} transcription{selectedTranscriptionIds.size === 1 ? '' : 's'}?
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone. All associated actions will also be removed.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="light"
              onClick={() => setDeleteModalOpened(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={bulkDeleteMutation.isPending}
              onClick={handleBulkDelete}
              leftSection={<IconTrash size={16} />}
            >
              Delete {selectedTranscriptionIds.size} Transcription{selectedTranscriptionIds.size === 1 ? '' : 's'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}