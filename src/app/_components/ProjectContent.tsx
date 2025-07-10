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
import {
  Group,
  Tabs,
  SegmentedControl,
  Title,
  Paper,
  Stack,
  Text,
  Box,
  Drawer,
  ScrollArea,
  Badge,
} from "@mantine/core";
import { api } from "~/trpc/react";
import {
  IconLayoutKanban,
  IconSettings,
  IconUsers,
  IconMessageCircle,
  IconClipboardList,
  IconTargetArrow,
  IconActivity,
  IconClock,
  IconMicrophone,
} from "@tabler/icons-react";

type TaskView = "list" | "alignment";
type TabValue =
  | "tasks"
  | "plan"
  | "goals"
  | "outcomes"
  | "timeline"
  | "team"
  | "transcriptions"
  | "settings"
  | "workflows";

export function ProjectContent({
  viewName,
  projectId,
}: {
  viewName: string;
  projectId: string;
}) {
  const [activeTab, setActiveTab] = useState<TabValue>("team");
  const [taskView, setTaskView] = useState<TaskView>("list");
  const [drawerOpened, setDrawerOpened] = useState(false);
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

  const handleViewChange = (value: string) => {
    setTaskView(value as TaskView);
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
      <Tabs value={activeTab} onChange={handleTabChange}>
        <Stack gap="xl" align="stretch" justify="flex-start">
          {/* Project Title and Description */}
          <Paper className="mx-auto w-full max-w-3xl" px={0} bg="transparent">
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
          </Paper>
          {/* Tabs Navigation - Moved Here */}
          <Tabs.List className="mx-auto w-full max-w-3xl">
          <Tabs.Tab value="team" leftSection={<IconUsers size={16} />}>
              Team
            </Tabs.Tab>
            <Tabs.Tab value="goals" leftSection={<IconTargetArrow size={16} />}>
              Goals
            </Tabs.Tab>
            <Tabs.Tab value="outcomes" leftSection={<IconActivity size={16} />}>
              Outcomes
            </Tabs.Tab>
            <Tabs.Tab value="timeline" leftSection={<IconClock size={16} />}>
              Timeline
            </Tabs.Tab>
            <Tabs.Tab value="tasks" leftSection={<IconLayoutKanban size={16} />}>
              Tasks
            </Tabs.Tab>
            <Tabs.Tab value="plan" leftSection={<IconClipboardList size={16} />}>
              Plan
            </Tabs.Tab>
            <Tabs.Tab value="transcriptions" leftSection={<IconMicrophone size={16} />}>
              Transcriptions
            </Tabs.Tab>
           <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
              Settings
            </Tabs.Tab>
          </Tabs.List>

          {/* Content Area - No longer needs extra padding if Tabs.List is outside */}
          <Tabs.Panel value="tasks">
            <Actions
              viewName={viewName}
              defaultView={taskView}
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
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="outcomes">
            <Paper
              p="md"
              radius="sm"
              className="mx-auto w-full max-w-3xl bg-[#262626]"
            >
              <OutcomesTable outcomes={outcomesQuery.data ?? []} />
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
                {project.transcriptionSessions && project.transcriptionSessions.length > 0 ? (
                  <Stack gap="sm">
                    {project.transcriptionSessions.map((session) => (
                      <Paper 
                        key={session.id} 
                        p="md" 
                        radius="sm" 
                        className="bg-[#2a2a2a] cursor-pointer hover:bg-[#333333] transition-colors"
                        onClick={() => handleTranscriptionClick(session)}
                      >
                        <Group justify="space-between" align="flex-start">
                          <Stack gap="xs" style={{ flex: 1 }}>
                            <Group gap="xs">
                              <Text size="sm" fw={500}>
                                Session ID: {session.sessionId}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {new Date(session.createdAt).toLocaleDateString()}
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

          <Tabs.Panel value="team">
            <div className="mx-auto mt-8 w-full max-w-3xl">
              <Title order={4} mb="md">Project Chat</Title>
              {/* <Chat /> */}
              <ManyChat />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="settings">
            <div className="mx-auto w-full max-w-3xl">
              <ProjectDetails project={project} />
              <Team projectId={projectId} />
            
            </div>
          </Tabs.Panel>
        </Stack>
      </Tabs>

      {/* Transcription Details Drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        title="Transcription Details"
        position="right"
        size="lg"
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
                      <strong>Created:</strong> {new Date(selectedTranscription.createdAt).toLocaleString()}
                    </Text>
                    <Text size="sm">
                      <strong>Updated:</strong> {new Date(selectedTranscription.updatedAt).toLocaleString()}
                    </Text>
                  </Group>
                </Stack>
              </Paper>

              <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                <Stack gap="sm">
                  <Title order={5}>Transcription</Title>
                  {selectedTranscription.transcription ? (
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {selectedTranscription.transcription}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No transcription available for this session.
                    </Text>
                  )}
                </Stack>
              </Paper>

              {selectedTranscription.screenshots && selectedTranscription.screenshots.length > 0 && (
                <Paper p="md" radius="sm" className="bg-[#2a2a2a]">
                  <Stack gap="sm">
                    <Title order={5}>Screenshots ({selectedTranscription.screenshots.length})</Title>
                    <Stack gap="xs">
                      {selectedTranscription.screenshots.map((screenshot: any) => (
                        <Paper key={screenshot.id} p="sm" radius="xs" className="bg-[#333333]">
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
