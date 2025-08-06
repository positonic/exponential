"use client";

import { useState } from "react";
import { Actions } from "./Actions";
import ProjectDetails from "./ProjectDetails";
//import Chat from "./Chat";
import ManyChat from "./ManyChat";
import { Team } from "./Team";
// import { Plan } from "./Plan";
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
  Badge,
  ActionIcon,
  Card,
} from "@mantine/core";
import { api } from "~/trpc/react";
import {
  IconLayoutKanban,
  IconSettings,
  // IconClipboardList,
  IconTargetArrow,
  IconActivity,
  IconClock,
  IconMicrophone,
  IconMessageCircle,
} from "@tabler/icons-react";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { ProjectIntegrations } from "./ProjectIntegrations";
import { ProjectSyncStatus } from "./ProjectSyncStatus";
import { TranscriptionDetailsDrawer } from "./TranscriptionDetailsDrawer";

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
  const [activeTab, setActiveTab] = useState<TabValue>("tasks");
  const [drawerOpened, setDrawerOpened] = useState(false);
  const [chatDrawerOpened, setChatDrawerOpened] = useState(false);
  const [settingsDrawerOpened, setSettingsDrawerOpened] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState<any>(null);
  const [syncStatusOpened, setSyncStatusOpened] = useState(false);
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
              {/* <Tabs.Tab
                value="plan"
                leftSection={<IconClipboardList size={16} />}
              >
                Plan
              </Tabs.Tab> */}
              <Tabs.Tab
                value="transcriptions"
                leftSection={<IconMicrophone size={16} />}
              >
                Transcriptions
              </Tabs.Tab>
            </Tabs.List>

            {/* Content Area */}
            <Tabs.Panel value="tasks">
              <Stack gap="md">
                <ProjectSyncStatus 
                  project={project} 
                  opened={syncStatusOpened} 
                  onToggle={() => setSyncStatusOpened(!syncStatusOpened)} 
                />
                <Actions
                  viewName={viewName}
                  defaultView="list"
                  projectId={projectId}
                  displayAlignment={false}
                  onToggleSyncStatus={() => setSyncStatusOpened(!syncStatusOpened)}
                />
              </Stack>
            </Tabs.Panel>

            {/* <Tabs.Panel value="plan">
              <Plan projectId={projectId} />
            </Tabs.Panel> */}

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
              <Stack gap="md">
                <Group justify="space-between" align="center">
                  <Title order={4}>Project Transcriptions</Title>
                  <Text size="sm" c="dimmed">
                    {project.transcriptionSessions?.length || 0} transcriptions
                  </Text>
                </Group>

                {project.transcriptionSessions && project.transcriptionSessions.length > 0 ? (
                  <Stack gap="lg">
                    {project.transcriptionSessions.map((session) => (
                      <Card
                        key={session.id}
                        withBorder
                        shadow="sm"
                        radius="md"
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleTranscriptionClick(session)}
                      >
                        <Stack gap="md">
                          {/* Transcription Header */}
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Stack gap="xs" style={{ flex: 1 }}>
                              <Group gap="sm" wrap="nowrap">
                                <Text size="lg" fw={600} lineClamp={1}>
                                  {session.title || `Session ${session.sessionId}`}
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
                          </Group>

                          {/* Transcription Preview */}
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
                      <Text size="lg" c="dimmed">No transcriptions found</Text>
                      <Text size="sm" c="dimmed">
                        Transcription sessions assigned to this project will appear here
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>
          </Stack>
        </Tabs>
      </div>

      {/* Transcription Details Drawer */}
      <TranscriptionDetailsDrawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        transcription={selectedTranscription}
      />

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
              <ManyChat projectId={projectId} />
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
          <ProjectIntegrations project={{ ...project, teamId: project.teamId }} />
          <Team projectId={projectId} />
        </div>
      </Drawer>
    </>
  );
}
