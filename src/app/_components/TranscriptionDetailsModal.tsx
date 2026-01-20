"use client";

import { useState } from "react";
import {
  Modal,
  ScrollArea,
  Stack,
  Paper,
  Group,
  Title,
  Badge,
  Text,
  Accordion,
  Button,
  Checkbox,
  List,
  Textarea,
  TextInput,
  ActionIcon,
} from "@mantine/core";
import { IconPencil, IconCheck, IconX, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { SmartContentRenderer } from "./SmartContentRenderer";
import { notifications } from "@mantine/notifications";
import { HTMLContent } from "./HTMLContent";
import { api } from "~/trpc/react";

interface TranscriptionDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  transcription: any;
  workflows?: any[];
  onSyncToIntegration?: (workflowId: string) => void;
  syncingToIntegration?: string | null;
  onTranscriptionUpdate?: (updated: any) => void;
}

export function TranscriptionDetailsModal({
  opened,
  onClose,
  transcription,
  workflows,
  onSyncToIntegration,
  syncingToIntegration,
  onTranscriptionUpdate,
}: TranscriptionDetailsModalProps) {
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());

  // Edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingTranscription, setEditingTranscription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [editedTranscriptionText, setEditedTranscriptionText] = useState("");

  // Update mutations
  const updateTitleMutation = api.transcription.updateTitle.useMutation({
    onSuccess: (updated) => {
      notifications.show({
        title: "Saved",
        message: "Title updated successfully",
        color: "green",
      });
      setEditingTitle(false);
      onTranscriptionUpdate?.(updated);
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update title",
        color: "red",
      });
    },
  });

  const updateDetailsMutation = api.transcription.updateDetails.useMutation({
    onSuccess: (updated) => {
      notifications.show({
        title: "Saved",
        message: "Changes saved successfully",
        color: "green",
      });
      setEditingDescription(false);
      setEditingTranscription(false);
      onTranscriptionUpdate?.(updated);
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to save changes",
        color: "red",
      });
    },
  });

  const utils = api.useUtils();
  const toggleActionsMutation = api.transcription.toggleActionGeneration.useMutation({
    onSuccess: async (result) => {
      if (result.action === "generated") {
        notifications.show({
          title: "Actions Generated",
          message: `Successfully created ${result.actionsCreated} action${result.actionsCreated === 1 ? "" : "s"} from the transcription`,
          color: "green",
        });
      } else {
        notifications.show({
          title: "Actions Deleted",
          message: `Successfully deleted ${result.actionsDeleted} action${result.actionsDeleted === 1 ? "" : "s"}`,
          color: "orange",
        });
      }
      // Invalidate queries to refresh data
      void utils.transcription.getAllTranscriptions.invalidate();
      if (transcription?.project?.id) {
        void utils.project.getById.invalidate({ id: transcription.project.id });
      }
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to toggle actions",
        color: "red",
      });
    },
  });

  const handleStartEditTitle = () => {
    setEditedTitle(transcription?.title ?? "");
    setEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (!transcription) return;
    updateTitleMutation.mutate({
      id: transcription.id,
      title: editedTitle,
    });
  };

  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setEditedTitle("");
  };

  const handleStartEditDescription = () => {
    setEditedDescription(transcription?.description ?? "");
    setEditingDescription(true);
  };

  const handleSaveDescription = () => {
    if (!transcription) return;
    updateDetailsMutation.mutate({
      id: transcription.id,
      description: editedDescription,
    });
  };

  const handleCancelEditDescription = () => {
    setEditingDescription(false);
    setEditedDescription("");
  };

  const handleStartEditTranscription = () => {
    setEditedTranscriptionText(transcription?.transcription ?? "");
    setEditingTranscription(true);
  };

  const handleSaveTranscription = () => {
    if (!transcription) return;
    updateDetailsMutation.mutate({
      id: transcription.id,
      transcription: editedTranscriptionText,
    });
  };

  const handleCancelEditTranscription = () => {
    setEditingTranscription(false);
    setEditedTranscriptionText("");
  };

  const handleClose = () => {
    setSelectedActionIds(new Set()); // Clear selection when modal closes
    onClose();
  };

  const handleSendToNotion = () => {
    if (!transcription || selectedActionIds.size === 0) return;

    // Check if there's a project assigned
    if (!transcription.project) {
      notifications.show({
        title: 'No Project Assigned',
        message: 'Please assign a project to this transcription first',
        color: 'orange',
      });
      return;
    }

    // Check if project is configured for Notion
    if (transcription.project.taskManagementTool !== 'notion') {
      const currentTool = transcription.project.taskManagementTool ?? 'internal';
      notifications.show({
        title: 'Project Not Configured for Notion',
        message: `This project is currently set to use "${currentTool}" task management.`,
        color: 'orange',
      });
      return;
    }

    // Get the workflow ID from project configuration
    const workflowId = transcription.project.taskManagementConfig?.workflowId as string | undefined;

    if (!workflowId) {
      notifications.show({
        title: 'No Notion Workflow',
        message: 'No Notion workflow configured for this project.',
        color: 'orange',
      });
      return;
    }

    // Find the workflow
    const workflow = workflows?.find((w: any) =>
      w.id === workflowId &&
      w.provider === 'notion' &&
      w.status === 'ACTIVE'
    );

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

    if (onSyncToIntegration) {
      onSyncToIntegration(workflowId);
    }
  };

  if (!transcription) return null;

  // Determine which accordion sections to open by default
  const defaultOpenSections = ['description'];
  if (!transcription.description && transcription.transcription) {
    defaultOpenSections.push('transcription');
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="md">
          <Title order={4}>{transcription.title ?? 'Transcription Details'}</Title>
          <Badge variant="light" color="blue">
            {transcription.sessionId}
          </Badge>
        </Group>
      }
      fullScreen
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      <ScrollArea h="calc(100vh - 100px)">
        <Stack gap="md" p="md">
          {/* Session Information */}
          <Paper p="md" radius="sm" className="bg-surface-secondary">
            <Stack gap="sm">
              <Group justify="space-between">
                {editingTitle ? (
                  <Group gap="xs" style={{ flex: 1 }}>
                    <TextInput
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.currentTarget.value)}
                      placeholder="Enter title..."
                      style={{ flex: 1 }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveTitle();
                        } else if (e.key === "Escape") {
                          handleCancelEditTitle();
                        }
                      }}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={handleCancelEditTitle}
                      disabled={updateTitleMutation.isPending}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                    <ActionIcon
                      variant="filled"
                      color="blue"
                      onClick={handleSaveTitle}
                      loading={updateTitleMutation.isPending}
                    >
                      <IconCheck size={18} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <Group gap="xs">
                    <Title order={5}>
                      {transcription.title ?? "Untitled Transcription"}
                    </Title>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={handleStartEditTitle}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Group>
                )}
                {transcription.sourceIntegration && (
                  <Badge variant="outline" color="gray">
                    {transcription.sourceIntegration.provider}
                    {transcription.sourceIntegration.name && ` (${transcription.sourceIntegration.name})`}
                  </Badge>
                )}
              </Group>

              {transcription.meetingDate && (
                <Text size="sm" c="dimmed">
                  <strong>Meeting Date:</strong> {new Date(transcription.meetingDate).toLocaleString()}
                </Text>
              )}
            </Stack>
          </Paper>

          {transcription.project && (
            <Paper p="md" radius="sm" className="bg-surface-secondary">
              <Stack gap="sm">
                <Title order={5}>Assigned Project</Title>
                <Group>
                  <Badge variant="filled" color="blue">
                    {transcription.project.name}
                  </Badge>
                </Group>
              </Stack>
            </Paper>
          )}

          {/* Accordion for main content sections */}
          <Accordion multiple defaultValue={defaultOpenSections}>
            {/* Description Section - Now Primary */}
            <Accordion.Item value="description">
              <Accordion.Control>
                <Group justify="space-between" style={{ width: '100%' }}>
                  <Title order={5}>Description</Title>
                  {!editingDescription && (
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditDescription();
                      }}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Paper p="md" radius="sm" className="bg-surface-tertiary">
                  {editingDescription ? (
                    <Stack gap="sm">
                      <Textarea
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.currentTarget.value)}
                        minRows={6}
                        autosize
                        maxRows={20}
                        placeholder="Enter description..."
                      />
                      <Group justify="flex-end" gap="xs">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={handleCancelEditDescription}
                          disabled={updateDetailsMutation.isPending}
                        >
                          <IconX size={18} />
                        </ActionIcon>
                        <ActionIcon
                          variant="filled"
                          color="blue"
                          onClick={handleSaveDescription}
                          loading={updateDetailsMutation.isPending}
                        >
                          <IconCheck size={18} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  ) : transcription.description ? (
                    <SmartContentRenderer content={transcription.description} />
                  ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                      No description. Click the edit icon to add one.
                    </Text>
                  )}
                </Paper>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Transcription Section - Now Secondary/Collapsed */}
            <Accordion.Item value="transcription">
              <Accordion.Control>
                <Group justify="space-between" style={{ width: '100%' }}>
                  <Title order={5}>Full Transcription</Title>
                  {!editingTranscription && (
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditTranscription();
                      }}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {editingTranscription ? (
                  <Stack gap="sm">
                    <Textarea
                      value={editedTranscriptionText}
                      onChange={(e) => setEditedTranscriptionText(e.currentTarget.value)}
                      minRows={10}
                      autosize
                      maxRows={30}
                      placeholder="Enter transcription..."
                      styles={{
                        input: {
                          fontFamily: 'monospace',
                          fontSize: '13px',
                        },
                      }}
                    />
                    <Group justify="flex-end" gap="xs">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={handleCancelEditTranscription}
                        disabled={updateDetailsMutation.isPending}
                      >
                        <IconX size={18} />
                      </ActionIcon>
                      <ActionIcon
                        variant="filled"
                        color="blue"
                        onClick={handleSaveTranscription}
                        loading={updateDetailsMutation.isPending}
                      >
                        <IconCheck size={18} />
                      </ActionIcon>
                    </Group>
                  </Stack>
                ) : transcription.transcription ? (
                  <div
                    style={{
                      maxHeight: '500px',
                      overflowY: 'auto',
                      paddingRight: '8px',
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'var(--border-primary) transparent',
                    }}
                    className="scrollable-transcription"
                  >
                    <TranscriptionRenderer
                      transcription={transcription.transcription}
                      provider={transcription.sourceIntegration?.provider}
                      isPreview={false}
                    />
                  </div>
                ) : (
                  <Text size="sm" c="dimmed" fs="italic">
                    No transcription. Click the edit icon to add one.
                  </Text>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            {/* Associated Actions Section */}
            <Accordion.Item value="actions">
              <Accordion.Control>
                <Group justify="space-between" style={{ width: '100%' }}>
                  <Title order={5}>Associated Actions</Title>
                  <Badge variant="light" color="blue" size="sm">
                    {transcription.actions?.length ?? 0}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Button size="xs" variant="light">
                        Create Action
                      </Button>
                      <Button
                        size="xs"
                        variant={transcription.processedAt && transcription.actions?.length > 0 ? "light" : "filled"}
                        color={transcription.processedAt && transcription.actions?.length > 0 ? "red" : "blue"}
                        leftSection={transcription.processedAt && transcription.actions?.length > 0 ? <IconTrash size={14} /> : <IconPlayerPlay size={14} />}
                        onClick={() => toggleActionsMutation.mutate({ transcriptionId: transcription.id })}
                        loading={toggleActionsMutation.isPending}
                        disabled={!transcription.projectId}
                        title={!transcription.projectId ? "Assign a project to this transcription first" : undefined}
                      >
                        {transcription.processedAt && transcription.actions?.length > 0 ? "Delete Actions" : "Generate Actions"}
                      </Button>
                    </Group>
                    {selectedActionIds.size > 0 && onSyncToIntegration && (
                      <Button
                        size="xs"
                        variant="filled"
                        color="gray"
                        onClick={handleSendToNotion}
                        loading={syncingToIntegration === transcription?.id}
                      >
                        Send {selectedActionIds.size} to Notion
                      </Button>
                    )}
                  </Group>
                  {transcription.actions && transcription.actions.length > 0 ? (
                    <Stack gap="xs">
                      {transcription.actions.map((action: any) => (
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
                                <HTMLContent html={action.name} />
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
            {transcription.summary && (() => {
              let summaryData;
              try {
                summaryData = typeof transcription.summary === "string"
                  ? JSON.parse(transcription.summary)
                  : transcription.summary;
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
                        {transcription.summary}
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
                            <Paper key={index} p="sm" radius="xs" className="bg-surface-tertiary">
                              <Text size="sm" fw={500}>
                                {chapter.title ?? `Chapter ${index + 1}`}
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
            {transcription.screenshots && transcription.screenshots.length > 0 && (
              <Accordion.Item value="screenshots">
                <Accordion.Control>
                  <Group justify="space-between" style={{ width: '100%' }}>
                    <Title order={5}>Screenshots</Title>
                    <Badge variant="light" color="green" size="sm">
                      {transcription.screenshots.length}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {transcription.screenshots.map((screenshot: any) => (
                      <Paper
                        key={screenshot.id}
                        p="sm"
                        radius="xs"
                        className="bg-surface-tertiary"
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

          {/* Metadata Footer */}
          <Paper p="md" radius="sm" className="bg-surface-secondary">
            <Group gap="md" wrap="wrap">
              <Text size="sm">
                <strong>Created:</strong>{" "}
                {new Date(transcription.createdAt).toLocaleString()}
              </Text>
              <Text size="sm">
                <strong>Updated:</strong>{" "}
                {new Date(transcription.updatedAt).toLocaleString()}
              </Text>
              {transcription.sourceIntegration && (
                <Text size="sm">
                  <strong>Source:</strong> {transcription.sourceIntegration.provider}
                  {transcription.sourceIntegration.name && ` (${transcription.sourceIntegration.name})`}
                </Text>
              )}
            </Group>
          </Paper>
        </Stack>
      </ScrollArea>
    </Modal>
  );
}
