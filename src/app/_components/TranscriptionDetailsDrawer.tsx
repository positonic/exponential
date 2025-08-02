"use client";

import { useState } from "react";
import {
  Drawer,
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
} from "@mantine/core";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { notifications } from "@mantine/notifications";

interface TranscriptionDetailsDrawerProps {
  opened: boolean;
  onClose: () => void;
  transcription: any;
  workflows?: any[];
  onSyncToIntegration?: (workflowId: string) => void;
  syncingToIntegration?: string | null;
}

export function TranscriptionDetailsDrawer({
  opened,
  onClose,
  transcription,
  workflows,
  onSyncToIntegration,
  syncingToIntegration,
}: TranscriptionDetailsDrawerProps) {
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());

  const handleClose = () => {
    setSelectedActionIds(new Set()); // Clear selection when drawer closes
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
      const currentTool = transcription.project.taskManagementTool || 'internal';
      notifications.show({
        title: 'Project Not Configured for Notion',
        message: `This project is currently set to use "${currentTool}" task management.`,
        color: 'orange',
      });
      return;
    }

    // Get the workflow ID from project configuration
    const workflowId = transcription.project.taskManagementConfig?.workflowId;
    
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

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title=""
      position="right"
      size="lg"
      trapFocus={false}
      lockScroll={false}
      withOverlay={false}
    >
      <ScrollArea h="100%">
        <Stack gap="md">
          {/* Session Information */}
          <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
            <Stack gap="sm">
              <Group justify="space-between">
                {transcription.title && (
                  <Title order={5}>
                    <strong>Title:</strong> {transcription.title}
                  </Title>
                )}
                <Badge variant="light" color="blue">
                  {transcription.sessionId}
                </Badge>
              </Group>
              
              {transcription.description && (
                <Text size="sm">
                  <strong>Description:</strong> {transcription.description}
                </Text>
              )}
            </Stack>
          </Paper>

          {transcription.project && (
            <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
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
          <Accordion multiple defaultValue={['transcription']}>
            {/* Transcription Section */}
            <Accordion.Item value="transcription">
              <Accordion.Control>
                <Title order={5}>Transcription</Title>
              </Accordion.Control>
              <Accordion.Panel>
                <TranscriptionRenderer
                  transcription={transcription.transcription}
                  provider={transcription.sourceIntegration?.provider}
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
                    {transcription.actions?.length || 0}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Button size="xs" variant="light">
                      Create Action
                    </Button>
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
        </Stack>
      </ScrollArea>
    </Drawer>
  );
}