"use client";

import { useState } from "react";
import { Actions } from "./Actions";
import ProjectDetails from "./ProjectDetails";
//import Chat from "./Chat";
import ManyChat from "./ManyChat";
import { Team } from "./Team";
import { Plan } from "./Plan";
import { GoalsTable } from "./GoalsTable";
import { OutcomesTable } from "./OutcomesTable";
import { OutcomeTimeline } from "./OutcomeTimeline";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { Button } from "@mantine/core";
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
  ActionIcon,
} from "@mantine/core";
import { api } from "~/trpc/react";
import {
  IconLayoutKanban,
  IconSettings,
  IconClipboardList,
  IconTargetArrow,
  IconActivity,
  IconClock,
  IconMicrophone,
  IconMessageCircle,
} from "@tabler/icons-react";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";

type TabValue =
  | "tasks"
  | "plan"
  | "goals"
  | "outcomes"
  | "timeline"
  | "transcriptions"
  | "workflows";

export function ProjectContent({
  viewName,
  projectId,
}: {
  viewName: string;
  projectId: string;
}) {
  const [activeTab, setActiveTab] = useState<TabValue>("goals");
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [chatDrawerOpened, setChatDrawerOpened] = useState(false);
  const [settingsDrawerOpened, setSettingsDrawerOpened] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState<any>(null);
  const { data: project, isLoading } = api.project.getById.useQuery({
    id: projectId,
  });
  const goalsQuery = api.goal.getProjectGoals.useQuery({ projectId });
  const outcomesQuery = api.outcome.getProjectOutcomes.useQuery({ projectId });

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value as TabValue);
    }
  };

  const handleTranscriptionClick = (transcription: any) => {
    setSelectedTranscription(transcription);
    setDrawerOpened(true);
  };

  if (isLoading) {
    return <div>Loading project...</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <>
      {/* Project Title and Description */}
      <Paper className="w-full max-w-3xl pl-8" px={0} bg="transparent" mb="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title
              order={2}
              mb={4}
              className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent"
            >
              {project.name}
            </Title>
            <Text size="sm" c="dimmed" lineClamp={2} maw={800}>
              {project.description}
            </Text>
          </div>
          <Group gap="xs">
            <ActionIcon
              variant="filled"
              size="lg"
              onClick={() => setChatDrawerOpened(true)}
              title="Open Project Chat"
            >
              <IconMessageCircle size={20} />
            </ActionIcon>
            <ActionIcon
              variant="filled"
              size="lg"
              onClick={() => setSettingsDrawerOpened(true)}
              title="Project Settings"
            >
              <IconSettings size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>

      {/* Main Content */}
      <div className="w-full max-w-3xl">
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Stack gap="xl" align="stretch" justify="flex-start">
            {/* Tabs Navigation */}
            <Tabs.List>
              <Tabs.Tab
                value="tasks"
                leftSection={<IconLayoutKanban size={16} />}
              >
                Tasks
              </Tabs.Tab>
              <Tabs.Tab
                value="goals"
                leftSection={<IconTargetArrow size={16} />}
              >
                Goals
              </Tabs.Tab>
              <Tabs.Tab
                value="outcomes"
                leftSection={<IconActivity size={16} />}
              >
                Outcomes
              </Tabs.Tab>
              <Tabs.Tab value="timeline" leftSection={<IconClock size={16} />}>
                Timeline
              </Tabs.Tab>
              <Tabs.Tab
                value="plan"
                leftSection={<IconClipboardList size={16} />}
              >
                Plan
              </Tabs.Tab>
              <Tabs.Tab
                value="transcriptions"
                leftSection={<IconMicrophone size={16} />}
              >
                Transcriptions
              </Tabs.Tab>
            </Tabs.List>

            {/* Content Area */}
            <Tabs.Panel value="tasks">
              <Actions
                viewName={viewName}
                defaultView="list"
                projectId={projectId}
              />
            </Tabs.Panel>

            <Tabs.Panel value="plan">
              <Plan projectId={projectId} />
            </Tabs.Panel>

            <Tabs.Panel value="goals">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <GoalsTable goals={goalsQuery.data ?? []} />
                <CreateGoalModal projectId={projectId}>
                  <Button variant="filled" color="dark" leftSection="+">
                    Add Goal
                  </Button>
                </CreateGoalModal>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="outcomes">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <OutcomesTable outcomes={outcomesQuery.data ?? []} />
                <CreateOutcomeModal projectId={projectId}>
                  <Button variant="filled" color="dark" leftSection="+">
                    Add Outcome
                  </Button>
                </CreateOutcomeModal>
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="timeline">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <OutcomeTimeline projectId={projectId} />
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="transcriptions">
              <Paper
                p="md"
                radius="sm"
                className="mx-auto w-full max-w-3xl bg-[#262626]"
              >
                <Stack gap="md">
                  <Title order={4}>Transcription Sessions</Title>
                  {project.transcriptionSessions &&
                  project.transcriptionSessions.length > 0 ? (
                    <Stack gap="sm">
                      {project.transcriptionSessions.map((session) => (
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
                                  Session ID: {session.sessionId}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {new Date(
                                    session.createdAt,
                                  ).toLocaleDateString()}
                                </Text>
                              </Group>
                              {session.transcription && (
                                <Text size="sm" c="dimmed" lineClamp={3}>
                                  {session.transcription}
                                </Text>
                              )}
                            </Stack>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No transcription sessions found for this project.
                    </Text>
                  )}
                </Stack>
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
        withOverlay={false} // optional: disables dimming the background
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
                      {new Date(
                        selectedTranscription.createdAt,
                      ).toLocaleString()}
                    </Text>
                    <Text size="sm">
                      <strong>Updated:</strong>{" "}
                      {new Date(
                        selectedTranscription.updatedAt,
                      ).toLocaleString()}
                    </Text>
                  </Group>
                </Stack>
              </Paper>

              <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                <Stack gap="sm">
                  <Title order={5}>Transcription</Title>
                  {selectedTranscription.transcription ? (
                    <Text
                      size="sm"
                      style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
                    >
                      {selectedTranscription.transcription}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No transcription available for this session.
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
                        {selectedTranscription.screenshots.map(
                          (screenshot: any) => (
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
                                  {new Date(
                                    screenshot.createdAt,
                                  ).toLocaleString()}
                                </Text>
                              </Group>
                            </Paper>
                          ),
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                )}
            </Stack>
          </ScrollArea>
        )}
      </Drawer>

      {/* Project Chat Drawer */}
      <Drawer.Root
        opened={chatDrawerOpened}
        onClose={() => setChatDrawerOpened(false)}
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
      >
        <Drawer.Content style={{ height: "100vh" }}>
          <Drawer.Header>
            <Drawer.Title>Project Chat</Drawer.Title>
            <Drawer.CloseButton />
          </Drawer.Header>
          <Drawer.Body style={{ height: "calc(100vh - 60px)", padding: 0 }}>
            {/* 60px is the default header height, adjust if needed */}
            <div className="flex h-full flex-col">
              <ManyChat />
            </div>
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>

      {/* Project Settings Drawer */}
      <Drawer
        opened={settingsDrawerOpened}
        onClose={() => setSettingsDrawerOpened(false)}
        title="Project Settings"
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
        withOverlay={false}
      >
        <div className="space-y-6">
          <ProjectDetails project={project} />
          <Team projectId={projectId} />
        </div>
      </Drawer>
    </>
  );
}
