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
  Textarea,
  TextInput,
  ActionIcon,
  Image,
} from "@mantine/core";
import { IconPencil, IconCheck, IconX, IconPlayerPlay } from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { SmartContentRenderer } from "./SmartContentRenderer";
import { FirefliesSummaryAccordionItems } from "./FirefliesSummaryRenderer";
import { parseFirefliesSummary, isEmptyFirefliesSummary } from "~/lib/fireflies-summary";
import { notifications } from "@mantine/notifications";
import { HTMLContent } from "./HTMLContent";
import { api } from "~/trpc/react";
import { TranscriptionDraftActionsModal } from "./TranscriptionDraftActionsModal";

interface FirefliesTranscriptionData {
  title?: string;
  sentences: Array<{
    text: string;
    speaker_name: string;
    start_time: number;
    end_time: number;
  }>;
}

interface ScreenshotWithTranscript {
  screenshot: {
    id: string;
    url: string;
    timestamp: string;
    createdAt: string | Date;
  };
  sentences: Array<{
    text: string;
    speaker_name: string;
    start_time: number;
    end_time: number;
  }>;
  plainText?: string;
}

function buildScreenshotTranscriptPairs(
  screenshots: Array<{ id: string; url: string; timestamp: string; createdAt: string | Date }>,
  transcription: string | null,
): ScreenshotWithTranscript[] {
  if (!screenshots || screenshots.length === 0) return [];

  const sorted = [...screenshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Try to parse as Fireflies JSON format
  let firefliesData: FirefliesTranscriptionData | null = null;
  if (transcription) {
    try {
      const parsed = JSON.parse(transcription) as Record<string, unknown>;
      if (parsed.sentences && Array.isArray(parsed.sentences)) {
        firefliesData = parsed as unknown as FirefliesTranscriptionData;
      }
    } catch {
      // Not JSON, treat as plain text
    }
  }

  if (firefliesData?.sentences && firefliesData.sentences.length > 0) {
    const sentencesSorted = [...firefliesData.sentences].sort(
      (a, b) => a.start_time - b.start_time,
    );
    const chunkSize = Math.ceil(sentencesSorted.length / sorted.length);

    return sorted.map((screenshot, index) => {
      const startIdx = index * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, sentencesSorted.length);
      return {
        screenshot,
        sentences: sentencesSorted.slice(startIdx, endIdx),
      };
    });
  }

  // Plain text mode: check for [SCREENSHOT] markers first
  if (transcription) {
    if (transcription.includes("[SCREENSHOT]")) {
      // Split by [SCREENSHOT] markers (with surrounding whitespace and trailing dots)
      const segments = transcription.split(/\s*\[SCREENSHOT\]\.?\s*/);
      const markerCount = (transcription.match(/\[SCREENSHOT\]/g) ?? []).length;
      // When fewer markers than screenshots, first screenshots get no text
      const gap = Math.max(0, sorted.length - markerCount);
      // segments[0] = intro text before first screenshot
      // segments[1..N] = text segments after each marker
      return sorted.map((screenshot, index) => {
        const segmentIndex = index - gap + 1;
        let text = "";
        if (segmentIndex >= 1 && segmentIndex < segments.length) {
          text = segments[segmentIndex]!.trim();
        }
        // If last screenshot, append any remaining segments
        if (index === sorted.length - 1) {
          const remaining = segments.slice(Math.max(segmentIndex + 1, 1)).map(s => s.trim()).filter(Boolean);
          if (remaining.length > 0) {
            text = text ? `${text} ${remaining.join(" ")}` : remaining.join(" ");
          }
        }
        return {
          screenshot,
          sentences: [],
          plainText: text || undefined,
        };
      });
    }

    // Fallback: split paragraphs evenly between screenshots
    const paragraphs = transcription.split(/\n\n+/).filter((p) => p.trim());
    if (paragraphs.length === 0) {
      return sorted.map((screenshot) => ({
        screenshot,
        sentences: [],
        plainText: transcription,
      }));
    }
    const chunkSize = Math.ceil(paragraphs.length / sorted.length);
    return sorted.map((screenshot, index) => {
      const startIdx = index * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, paragraphs.length);
      return {
        screenshot,
        sentences: [],
        plainText: paragraphs.slice(startIdx, endIdx).join("\n\n"),
      };
    });
  }

  return sorted.map((screenshot) => ({
    screenshot,
    sentences: [],
  }));
}

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
  const [draftActionsOpened, setDraftActionsOpened] = useState(false);

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
  const generateDraftsMutation =
    api.transcription.generateDraftActions.useMutation({
      onSuccess: (result) => {
        if (result.alreadyPublished) {
          notifications.show({
            title: "Actions Already Created",
            message: "This transcription already has actions.",
            color: "orange",
          });
          return;
        }

        if (result.actionsCreated === 0 && result.draftCount === 0) {
          notifications.show({
            title: "No Actions Found",
            message: "No action items were detected in this transcription.",
            color: "gray",
          });
          return;
        }

        notifications.show({
          title: "Draft Actions Ready",
          message: "Review and edit the draft actions before creating them.",
          color: "green",
        });

        void utils.transcription.getAllTranscriptions.invalidate();
        setDraftActionsOpened(true);
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to generate draft actions",
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

  const handleOpenDraftActions = () => {
    if (transcription.actionsSavedAt) {
      setDraftActionsOpened(true);
      return;
    }

    generateDraftsMutation.mutate({ transcriptionId: transcription.id });
  };

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
                        variant="filled"
                        color="blue"
                        leftSection={<IconPlayerPlay size={14} />}
                        onClick={handleOpenDraftActions}
                        loading={generateDraftsMutation.isPending}
                      >
                        {transcription.actionsSavedAt
                          ? "Review Draft Actions"
                          : "Generate Draft Actions"}
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
              const summaryData = parseFirefliesSummary(transcription.summary);

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

              if (isEmptyFirefliesSummary(summaryData)) return null;

              return <FirefliesSummaryAccordionItems summary={summaryData} />;
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
                  <div className="flex flex-wrap gap-3">
                    {transcription.screenshots.map((screenshot: any) => (
                      <a
                        key={screenshot.id}
                        href={screenshot.url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block shrink-0"
                      >
                        <Image
                          src={screenshot.url as string}
                          alt={`Screenshot from ${screenshot.timestamp}`}
                          w={100}
                          h={75}
                          fit="cover"
                          radius="sm"
                          className="cursor-pointer transition-opacity hover:opacity-80"
                        />
                      </a>
                    ))}
                  </div>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Transcription with Screenshots Section */}
            {transcription.screenshots && transcription.screenshots.length > 0 && transcription.transcription && (() => {
              const pairs = buildScreenshotTranscriptPairs(
                transcription.screenshots as Array<{ id: string; url: string; timestamp: string; createdAt: string | Date }>,
                transcription.transcription as string,
              );
              if (pairs.length === 0) return null;

              return (
                <Accordion.Item value="transcription-screenshots">
                  <Accordion.Control>
                    <Group justify="space-between" style={{ width: '100%' }}>
                      <Title order={5}>Transcription with Screenshots</Title>
                      <Badge variant="light" color="violet" size="sm">
                        {pairs.length} segments
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="lg">
                      {pairs.map((pair, index) => (
                        <div key={pair.screenshot.id} className="flex gap-4">
                          <div className="shrink-0">
                            <a
                              href={pair.screenshot.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Image
                                src={pair.screenshot.url}
                                alt={`Screenshot ${index + 1}`}
                                w={200}
                                h={150}
                                fit="cover"
                                radius="sm"
                                className="cursor-pointer transition-opacity hover:opacity-80"
                              />
                            </a>
                            <Text size="xs" c="dimmed" mt={4} ta="center">
                              {pair.screenshot.timestamp}
                            </Text>
                          </div>
                          <Paper
                            p="md"
                            radius="sm"
                            className="bg-surface-tertiary flex-1"
                            style={{ minHeight: 150 }}
                          >
                            {pair.sentences.length > 0 ? (
                              <Stack gap="xs">
                                {pair.sentences.map((sentence, sIdx) => (
                                  <Group key={sIdx} align="flex-start" gap="sm" wrap="nowrap">
                                    <Badge
                                      size="xs"
                                      variant="light"
                                      color="blue"
                                      style={{ minWidth: "fit-content" }}
                                    >
                                      {sentence.speaker_name}
                                    </Badge>
                                    <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                      {sentence.text}
                                    </Text>
                                  </Group>
                                ))}
                              </Stack>
                            ) : pair.plainText ? (
                              <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                {pair.plainText}
                              </Text>
                            ) : (
                              <Text size="sm" c="dimmed" fs="italic">
                                No transcription text for this segment.
                              </Text>
                            )}
                          </Paper>
                        </div>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })()}
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
      <TranscriptionDraftActionsModal
        opened={draftActionsOpened}
        onClose={() => setDraftActionsOpened(false)}
        transcriptionId={transcription.id}
      />
    </Modal>
  );
}
