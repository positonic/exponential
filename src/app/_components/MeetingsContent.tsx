"use client";

import { useState } from "react";
import {
  Group,
  Tabs,
  Title,
  Paper,
  Stack,
  Text,
  Drawer,
  ScrollArea,
  Badge,
  Select,
  Button,
  Accordion,
  List,
  Card,
  Checkbox,
  MultiSelect,
  ActionIcon,
  Menu,
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
} from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { ActionList } from "./ActionList";
import { FirefliesSyncPanel } from "./FirefliesSyncPanel";

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
  const [updatingActions, setUpdatingActions] = useState<string | null>(null); // transcriptionId being updated
  const [successMessages, setSuccessMessages] = useState<Record<string, string>>({}); // transcriptionId -> message
  const [syncingToIntegration, setSyncingToIntegration] = useState<string | null>(null); // transcriptionId being synced to external integration
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set()); // For manual action selection
  
  // New state for filtering and bulk operations
  const [selectedIntegrationFilter, setSelectedIntegrationFilter] = useState<string[]>([]);
  const [selectedTranscriptionIds, setSelectedTranscriptionIds] = useState<Set<string>>(new Set());
  const [bulkProjectAssignment, setBulkProjectAssignment] = useState<string | null>(null);
  
  const { data: transcriptions, isLoading } = api.transcription.getAllTranscriptions.useQuery();
  const { data: projects } = api.project.getAll.useQuery();
  const { data: workflows = [] } = api.workflow.list.useQuery();
  const utils = api.useUtils();
  
  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onSuccess: () => {
      // Refetch transcriptions to update the UI
      void utils.transcription.getAllTranscriptions.invalidate();
    },
  });

  const bulkAssignProjectMutation = api.transcription.bulkAssignProject.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Bulk Assignment Complete',
        message: `Assigned ${data.count} transcriptions to project`,
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

  const updateActionsProjectMutation = api.action.updateActionsProject.useMutation({
    onSuccess: (data, variables) => {
      const transcriptionId = variables.transcriptionSessionId;
      setUpdatingActions(null);
      
      // Set success message for this specific transcription
      setSuccessMessages(prev => ({ ...prev, [transcriptionId]: data.message }));
      
      // Fade out the message after 1 second
      setTimeout(() => {
        setSuccessMessages(prev => {
          const newMessages = { ...prev };
          delete newMessages[transcriptionId];
          return newMessages;
        });
      }, 1000);
      
      // Refetch transcriptions to update the UI
      void utils.transcription.getAllTranscriptions.invalidate();
    },
    onError: () => {
      setUpdatingActions(null);
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

  const handleUpdateActions = (transcriptionSessionId: string, projectId: string | null) => {
    setUpdatingActions(transcriptionSessionId);
    updateActionsProjectMutation.mutate({ transcriptionSessionId, projectId });
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

  const handleSendToNotion = () => {
    console.log('handleSendToNotion called');
    console.log('selectedTranscription:', selectedTranscription);
    console.log('selectedActionIds:', selectedActionIds);
    
    if (!selectedTranscription || selectedActionIds.size === 0) return;

    // Check if there's a project assigned
    if (!selectedTranscription.project) {
      notifications.show({
        title: 'No Project Assigned',
        message: 'Please assign a project to this transcription first',
        color: 'orange',
      });
      return;
    }

    console.log('Project task management tool:', selectedTranscription.project.taskManagementTool);
    console.log('Project task management config:', selectedTranscription.project.taskManagementConfig);

    // Check if project is configured for Notion
    if (selectedTranscription.project.taskManagementTool !== 'notion') {
      const currentTool = selectedTranscription.project.taskManagementTool || 'internal';
      notifications.show({
        title: 'Project Not Configured for Notion',
        message: `This project is currently set to use "${currentTool}" task management. To send actions to Notion, go to project settings and change the task management tool to "Notion".`,
        color: 'orange',
      });
      return;
    }

    // Get the workflow ID from project configuration
    const workflowId = selectedTranscription.project.taskManagementConfig?.workflowId;
    console.log('Workflow ID from project:', workflowId);
    
    if (!workflowId) {
      notifications.show({
        title: 'No Notion Workflow',
        message: 'No Notion workflow configured for this project. Please configure it in project settings.',
        color: 'orange',
      });
      return;
    }

    // Find the workflow
    const workflow = workflows.find(w => 
      w.id === workflowId && 
      w.provider === 'notion' && 
      w.status === 'ACTIVE'
    );

    console.log('Found workflow:', workflow);
    console.log('All workflows:', workflows);

    if (!workflow) {
      notifications.show({
        title: 'Workflow Not Found',
        message: 'The configured Notion workflow is no longer available or active.',
        color: 'orange',
      });
      return;
    }

    // Show immediate feedback
    notifications.show({
      title: 'Sending to Notion',
      message: `Sending ${selectedActionIds.size} actions to Notion...`,
      color: 'blue',
      loading: true,
      id: 'notion-sync',
    });

    // TODO: Implement API call to send specific actions to Notion
    // For now, we'll use the existing sync mechanism which syncs all actions
    setSyncingToIntegration(selectedTranscription.id);
    
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
          // Clear selection after successful sending
          setSelectedActionIds(new Set());
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
  };

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
                                  {/* Update Actions Button */}
                                  {session.projectId && (
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="blue"
                                      loading={updatingActions === session.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateActions(session.id, session.projectId);
                                      }}
                                    >
                                      Update Actions
                                    </Button>
                                  )}

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
                                  
                                  {/* Success Messages */}
                                  {successMessages[session.id] && updatingActions !== session.id && (
                                    <Text size="xs" c="green" fw={500}>
                                      {successMessages[session.id]}
                                    </Text>
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
      <Drawer
        opened={drawerOpened}
        onClose={() => {
          setDrawerOpened(false);
          setSelectedActionIds(new Set()); // Clear selection when drawer closes
        }}
        title="Transcription Details"
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
        withOverlay={false}
      >
        {selectedTranscription && (
          <ScrollArea h="100%">
            <Stack gap="md">
              {/* Session Information */}
              <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                <Stack gap="sm">
                  <Group justify="space-between">
                  {selectedTranscription.title && (
                    <Title order={5}>
                      <strong>Title:</strong> {selectedTranscription.title}
                    </Title>
                  )}
                  <Badge variant="light" color="blue">
                      {selectedTranscription.sessionId}
                    </Badge>
                  </Group>
                  
                  {selectedTranscription.description && (
                    <Text size="sm">
                      <strong>Description:</strong> {selectedTranscription.description}
                    </Text>
                  )}
                  
                </Stack>
              </Paper>

              {selectedTranscription.project && (
                <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                  <Stack gap="sm">
                    <Title order={5}>Assigned Project</Title>
                    <Group>
                      <Badge variant="filled" color="blue">
                        {selectedTranscription.project.name}
                      </Badge>
                    </Group>
                  </Stack>
                </Paper>
              )}

              {/* Accordion for main content sections */}
              <Accordion multiple defaultValue={['transcription']}>
                {/* Transcription Section */}
                <Accordion.Item value="transcription">
                  <Accordion.Control>
                    <Title order={5}>Transcription</Title>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <TranscriptionRenderer
                      transcription={selectedTranscription.transcription}
                      provider={selectedTranscription.sourceIntegration?.provider}
                      isPreview={false}
                    />
                  </Accordion.Panel>
                </Accordion.Item>

                {/* Associated Actions Section */}
                <Accordion.Item value="actions">
                  <Accordion.Control>
                    <Group justify="space-between" style={{ width: '100%' }}>
                      <Title order={5}>Associated Actions</Title>
                      <Badge variant="light" color="blue" size="sm">
                        {selectedTranscription.actions?.length || 0}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Button size="xs" variant="light">
                          Create Action
                        </Button>
                        {selectedActionIds.size > 0 && (
                          <Button 
                            size="xs" 
                            variant="filled"
                            color="gray"
                            onClick={() => handleSendToNotion()}
                            loading={syncingToIntegration === selectedTranscription?.id}
                          >
                            Send {selectedActionIds.size} to Notion
                          </Button>
                        )}
                      </Group>
                      {selectedTranscription.actions && selectedTranscription.actions.length > 0 ? (
                        <Stack gap="xs">
                          {selectedTranscription.actions.map((action: any) => (
                            <Paper
                              key={action.id}
                              p="sm"
                              radius="sm"
                              withBorder
                              className="hover:shadow-sm transition-shadow"
                            >
                              <Group>
                                <Checkbox
                                  checked={selectedActionIds.has(action.id)}
                                  onChange={(event) => {
                                    const newSelectedIds = new Set(selectedActionIds);
                                    if (event.currentTarget.checked) {
                                      newSelectedIds.add(action.id);
                                    } else {
                                      newSelectedIds.delete(action.id);
                                    }
                                    setSelectedActionIds(newSelectedIds);
                                  }}
                                />
                                <Stack gap={4} style={{ flex: 1 }}>
                                  <Text size="sm" fw={500}>
                                    {action.name}
                                  </Text>
                                  {action.description && (
                                    <Text size="xs" c="dimmed">
                                      {action.description}
                                    </Text>
                                  )}
                                  <Group gap="xs">
                                    {action.priority && (
                                      <Badge size="xs" variant="light" color="blue">
                                        {action.priority}
                                      </Badge>
                                    )}
                                    {action.dueDate && (
                                      <Badge size="xs" variant="light" color="red">
                                        Due: {new Date(action.dueDate).toLocaleDateString()}
                                      </Badge>
                                    )}
                                    <Badge size="xs" variant="light" color={action.status === 'COMPLETED' ? 'green' : 'gray'}>
                                      {action.status}
                                    </Badge>
                                  </Group>
                                </Stack>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          No actions associated with this transcription yet.
                        </Text>
                      )}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>

                {/* Summary Sections */}
                {selectedTranscription.summary && (() => {
                  let summaryData;
                  try {
                    summaryData = typeof selectedTranscription.summary === "string" 
                      ? JSON.parse(selectedTranscription.summary) 
                      : selectedTranscription.summary;
                  } catch {
                    summaryData = null;
                  }

                  if (!summaryData) {
                    return (
                      <Accordion.Item value="summary">
                        <Accordion.Control>
                          <Title order={5}>Summary</Title>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {selectedTranscription.summary}
                          </Text>
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  }

                  return (
                    <>
                      {/* Keywords */}
                      {summaryData.keywords && summaryData.keywords.length > 0 && (
                        <Accordion.Item value="keywords">
                          <Accordion.Control>
                            <Title order={5}>Keywords</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Group gap="xs">
                              {summaryData.keywords.map((keyword: string, index: number) => (
                                <Badge key={index} variant="light" size="sm">
                                  {keyword}
                                </Badge>
                              ))}
                            </Group>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Action Items */}
                      {summaryData.action_items && (
                        <Accordion.Item value="summary-actions">
                          <Accordion.Control>
                            <Title order={5}>Action Items (From Summary)</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap", fontFamily: 'monospace' }}>
                              {summaryData.action_items}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Overview */}
                      {summaryData.overview && (
                        <Accordion.Item value="overview">
                          <Accordion.Control>
                            <Title order={5}>Overview</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                              {summaryData.overview}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Short Summary */}
                      {summaryData.short_summary && (
                        <Accordion.Item value="short-summary">
                          <Accordion.Control>
                            <Title order={5}>Short Summary</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                              {summaryData.short_summary}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Gist */}
                      {summaryData.gist && (
                        <Accordion.Item value="gist">
                          <Accordion.Control>
                            <Title order={5}>Gist</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                              {summaryData.gist}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Bullet Gist */}
                      {summaryData.bullet_gist && (
                        <Accordion.Item value="bullet-gist">
                          <Accordion.Control>
                            <Title order={5}>Key Points</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                              {summaryData.bullet_gist}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Shorthand Bullet */}
                      {summaryData.shorthand_bullet && (
                        <Accordion.Item value="shorthand-bullet">
                          <Accordion.Control>
                            <Title order={5}>Detailed Breakdown</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                              {summaryData.shorthand_bullet}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Outline */}
                      {summaryData.outline && (
                        <Accordion.Item value="outline">
                          <Accordion.Control>
                            <Title order={5}>Outline</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                              {summaryData.outline}
                            </Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Meeting Type */}
                      {summaryData.meeting_type && (
                        <Accordion.Item value="meeting-type">
                          <Accordion.Control>
                            <Title order={5}>Meeting Type</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Badge variant="filled" color="cyan">
                              {summaryData.meeting_type}
                            </Badge>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Topics Discussed */}
                      {summaryData.topics_discussed && summaryData.topics_discussed.length > 0 && (
                        <Accordion.Item value="topics">
                          <Accordion.Control>
                            <Title order={5}>Topics Discussed</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <List>
                              {summaryData.topics_discussed.map((topic: string, index: number) => (
                                <List.Item key={index}>{topic}</List.Item>
                              ))}
                            </List>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}

                      {/* Transcript Chapters */}
                      {summaryData.transcript_chapters && summaryData.transcript_chapters.length > 0 && (
                        <Accordion.Item value="chapters">
                          <Accordion.Control>
                            <Title order={5}>Transcript Chapters</Title>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="sm">
                              {summaryData.transcript_chapters.map((chapter: any, index: number) => (
                                <Paper key={index} p="sm" radius="xs" className="bg-[#333333]">
                                  <Text size="sm" fw={500}>
                                    {chapter.title || `Chapter ${index + 1}`}
                                  </Text>
                                  {chapter.summary && (
                                    <Text size="xs" c="dimmed" mt="xs">
                                      {chapter.summary}
                                    </Text>
                                  )}
                                </Paper>
                              ))}
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      )}
                    </>
                  );
                })()}

                {/* Screenshots Section */}
                {selectedTranscription.screenshots && selectedTranscription.screenshots.length > 0 && (
                  <Accordion.Item value="screenshots">
                    <Accordion.Control>
                      <Group justify="space-between" style={{ width: '100%' }}>
                        <Title order={5}>Screenshots</Title>
                        <Badge variant="light" color="green" size="sm">
                          {selectedTranscription.screenshots.length}
                        </Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        {selectedTranscription.screenshots.map((screenshot: any) => (
                          <Paper
                            key={screenshot.id}
                            p="sm"
                            radius="xs"
                            className="bg-[#333333]"
                          >
                            <Group justify="space-between">
                              <Text size="sm" fw={500}>
                                {screenshot.timestamp}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {new Date(screenshot.createdAt).toLocaleString()}
                              </Text>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )}
              </Accordion>
              <Group gap="md">
                    <Text size="sm">
                      <strong>Created:</strong>{" "}
                      {new Date(selectedTranscription.createdAt).toLocaleString()}
                    </Text>
                    <Text size="sm">
                      <strong>Updated:</strong>{" "}
                      {new Date(selectedTranscription.updatedAt).toLocaleString()}
                    </Text>
                    {selectedTranscription.sourceIntegration && (
                    <Text size="sm">
                      <strong>Source:</strong> {selectedTranscription.sourceIntegration.provider} 
                      {selectedTranscription.sourceIntegration.name && ` (${selectedTranscription.sourceIntegration.name})`}
                    </Text>
                  )}
                  </Group>
            </Stack>
          </ScrollArea>
        )}
      </Drawer>
    </>
  );
}