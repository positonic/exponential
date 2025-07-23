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
} from "@mantine/core";
import { api } from "~/trpc/react";
import {
  IconMicrophone,
  IconClipboardList,
  IconCalendar,
} from "@tabler/icons-react";
import { TranscriptionRenderer } from "./TranscriptionRenderer";

type TabValue = "transcriptions" | "upcoming" | "archive";

export function MeetingsContent() {
  const [activeTab, setActiveTab] = useState<TabValue>("transcriptions");
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState<any>(null);
  
  const { data: transcriptions, isLoading } = api.transcription.getAllTranscriptions.useQuery();
  const { data: projects } = api.project.getAll.useQuery();
  
  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onSuccess: () => {
      // Refetch transcriptions to update the UI
      api.transcription.getAllTranscriptions.useQuery();
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
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <Stack gap="md">
                  <Title order={4}>All Transcriptions</Title>
                  {transcriptions && transcriptions.length > 0 ? (
                    <Stack gap="sm">
                      {transcriptions.map((session) => (
                        <Paper
                          key={session.id}
                          p="md"
                          radius="sm"
                          className="cursor-pointer bg-[#2a2a2a] transition-colors hover:bg-[#333333]"
                          onClick={() => handleTranscriptionClick(session)}
                        >
                          <Group justify="space-between" align="flex-start">
                            <Stack gap="xs" style={{ flex: 1 }}>
                              <Group gap="xs">
                                <Text size="sm" fw={500}>
                                  {session.title || `Session ${session.sessionId}`}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {new Date(session.createdAt).toLocaleDateString()}
                                </Text>
                              </Group>
                              {session.transcription && (
                                <TranscriptionRenderer
                                  transcription={session.transcription}
                                  provider={session.sourceIntegration?.provider}
                                  isPreview={true}
                                  maxLines={2}
                                />
                              )}
                              {session.project && (
                                <Badge variant="light" color="blue" size="sm">
                                  {session.project.name}
                                </Badge>
                              )}
                            </Stack>
                            <Select
                              placeholder="Assign to project"
                              value={session.projectId}
                              onChange={(value) => handleProjectAssignment(session.id, value)}
                              onClick={(e) => e.stopPropagation()}
                              data={[
                                { value: "", label: "No project" },
                                ...(projects?.map((p) => ({
                                  value: p.id,
                                  label: p.name,
                                })) || []),
                              ]}
                              size="xs"
                              style={{ width: 200 }}
                            />
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No transcription sessions found.
                    </Text>
                  )}
                </Stack>
              </Paper>
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
        onClose={() => setDrawerOpened(false)}
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
              <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={5}>Session Information</Title>
                    <Badge variant="light" color="blue">
                      {selectedTranscription.sessionId}
                    </Badge>
                  </Group>
                  <Group gap="md">
                    <Text size="sm">
                      <strong>Created:</strong>{" "}
                      {new Date(selectedTranscription.createdAt).toLocaleString()}
                    </Text>
                    <Text size="sm">
                      <strong>Updated:</strong>{" "}
                      {new Date(selectedTranscription.updatedAt).toLocaleString()}
                    </Text>
                  </Group>
                  {selectedTranscription.title && (
                    <Text size="sm">
                      <strong>Title:</strong> {selectedTranscription.title}
                    </Text>
                  )}
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

              <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                <Stack gap="sm">
                  <Title order={5}>Transcription</Title>
                  <TranscriptionRenderer
                    transcription={selectedTranscription.transcription}
                    provider={selectedTranscription.sourceIntegration?.provider}
                    isPreview={false}
                  />
                </Stack>
              </Paper>

              {selectedTranscription.summary && (
                <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                  <Stack gap="sm">
                    <Title order={5}>Summary</Title>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                      {typeof selectedTranscription.summary === "string"
                        ? selectedTranscription.summary
                        : JSON.stringify(selectedTranscription.summary, null, 2)}
                    </Text>
                  </Stack>
                </Paper>
              )}

              {/* Associated Actions Section */}
              <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={5}>Associated Actions</Title>
                    <Button size="xs" variant="light">
                      Create Action
                    </Button>
                  </Group>
                  {selectedTranscription.actions && selectedTranscription.actions.length > 0 ? (
                    <Stack gap="xs">
                      {selectedTranscription.actions.map((action: any) => (
                        <Paper key={action.id} p="sm" radius="xs" className="bg-[#333333]">
                          <Group justify="space-between">
                            <Text size="sm" fw={500}>
                              {action.name}
                            </Text>
                            <Group gap="xs">
                              <Badge 
                                variant="light" 
                                color={action.status === "COMPLETED" ? "green" : "yellow"}
                                size="xs"
                              >
                                {action.status}
                              </Badge>
                              <Badge variant="outline" size="xs">
                                {action.priority}
                              </Badge>
                            </Group>
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
              </Paper>

              {selectedTranscription.screenshots &&
                selectedTranscription.screenshots.length > 0 && (
                  <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                    <Stack gap="sm">
                      <Title order={5}>
                        Screenshots ({selectedTranscription.screenshots.length})
                      </Title>
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
                    </Stack>
                  </Paper>
                )}
            </Stack>
          </ScrollArea>
        )}
      </Drawer>
    </>
  );
}