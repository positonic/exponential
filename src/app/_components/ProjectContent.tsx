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
  IconX,
} from "@tabler/icons-react";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";
import { TranscriptionRenderer } from "./TranscriptionRenderer";
import { ProjectIntegrations } from "./ProjectIntegrations";
import { ProjectSyncStatus } from "./ProjectSyncStatus";
import { ProjectSyncConfiguration } from "./ProjectSyncConfiguration";
import { TranscriptionDetailsDrawer } from "./TranscriptionDetailsDrawer";
import Link from "next/link";

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
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'settings' | null>(null);
  const [selectedTranscription, setSelectedTranscription] = useState<any>(null);
  const [syncStatusOpened, setSyncStatusOpened] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const { data: project, isLoading } = api.project.getById.useQuery({
    id: projectId,
  });
  const { data: projectActions } = api.action.getProjectActions.useQuery({ projectId });
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
      <Paper className="w-full pl-8" px={0} bg="transparent" mb="xl">
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
              variant={activeDrawer === 'chat' ? 'gradient' : 'filled'}
              gradient={activeDrawer === 'chat' ? { from: 'blue', to: 'indigo', deg: 45 } : undefined}
              size="lg"
              onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
              title={activeDrawer === 'chat' ? 'Close Project Chat' : 'Open Project Chat'}
              className={activeDrawer === 'chat' ? 'shadow-lg scale-105' : 'hover:scale-105'}
              style={{
                transition: 'all 0.2s ease',
                transform: activeDrawer === 'chat' ? 'scale(1.05)' : 'scale(1)',
                boxShadow: activeDrawer === 'chat' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : undefined,
              }}
            >
              <IconMessageCircle size={20} />
            </ActionIcon>
            <ActionIcon
              variant={activeDrawer === 'settings' ? 'gradient' : 'filled'}
              gradient={activeDrawer === 'settings' ? { from: 'gray', to: 'dark', deg: 45 } : undefined}
              size="lg"
              onClick={() => setActiveDrawer(activeDrawer === 'settings' ? null : 'settings')}
              title={activeDrawer === 'settings' ? 'Close Project Settings' : 'Open Project Settings'}
              className={activeDrawer === 'settings' ? 'shadow-lg scale-105' : 'hover:scale-105'}
              style={{
                transition: 'all 0.2s ease',
                transform: activeDrawer === 'settings' ? 'scale(1.05)' : 'scale(1)',
                boxShadow: activeDrawer === 'settings' ? '0 4px 12px rgba(107, 114, 128, 0.3)' : undefined,
              }}
            >
              <IconSettings size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>

      {/* Main Content */}
      <div className="w-full">
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
                className="mx-auto w-full bg-[#262626]"
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
                className="mx-auto w-full  bg-[#262626]"
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
                className="mx-auto w-full  bg-[#262626]"
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
        opened={activeDrawer === 'chat'}
        onClose={() => setActiveDrawer(null)}
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
      >
        <Drawer.Content 
          style={{ 
            height: "100vh",
            backgroundColor: 'transparent'
          }}
        >
          <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 via-gray-900 to-slate-900">
            {/* Custom Header integrated with ManyChat design */}
            <div className="bg-gradient-to-r from-slate-800/90 via-gray-800/80 to-slate-800/90 backdrop-blur-lg border-b border-gray-600/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <Text size="lg" fw={600} className="bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">
                    Project Chat
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  onClick={() => setActiveDrawer(null)}
                  c="dimmed"
                  className="hover:bg-gray-700/50 transition-colors"
                >
                  <IconX size={20} />
                </ActionIcon>
              </div>
            </div>
            
            <div className="flex-1 h-full overflow-hidden">
              <ManyChat projectId={projectId} />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Root>

      {/* Project Settings Drawer */}
      <Drawer
        opened={activeDrawer === 'settings'}
        onClose={() => setActiveDrawer(null)}
        position="right"
        size="lg"
        trapFocus={false}
        lockScroll={false}
        withOverlay={false}
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: { backgroundColor: 'var(--mantine-color-dark-7)' }
        }}
      >
        <Stack gap="xl" p="lg" h="100vh" style={{ overflowY: 'auto' }}>
          {/* Custom Header with Close Button */}
          <Group justify="space-between" align="center" pb="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
            <div>
              <Text size="lg" fw={600} c="bright">
                {project.name}
              </Text>
              <Text size="sm" c="dimmed">
                Project Configuration
              </Text>
            </div>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => setActiveDrawer(null)}
              c="dimmed"
            >
              <IconX size={20} />
            </ActionIcon>
          </Group>

          {/* Team Section */}
          {project.team && (
            <Stack gap="xs">
              <Group gap="xs" align="center">
                <IconTargetArrow size={16} color="var(--mantine-color-blue-4)" />
                <Text size="sm" fw={600} c="blue.4">
                  TEAM
                </Text>
              </Group>
              <Card 
                withBorder 
                p="lg" 
                radius="lg" 
                className="bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-purple-500/15 border-blue-500/30 hover:border-blue-400/50 transition-all duration-200 hover:shadow-lg"
              >
                <Group justify="space-between" align="flex-start">
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text size="xl" fw={700} c="bright" className="bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">
                      {project.team.name}
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {project.team.description || 'Collaborate with your team on this project'}
                    </Text>
                  </Stack>
                  <Button
                    variant="gradient"
                    gradient={{ from: 'blue', to: 'indigo', deg: 45 }}
                    size="sm"
                    component={Link}
                    href={`/teams/${project.team.slug}`}
                    leftSection={<IconTargetArrow size={14} />}
                    className="shrink-0"
                  >
                    View Team
                  </Button>
                </Group>
              </Card>
            </Stack>
          )}

          {/* Project Details */}
          <ProjectDetails project={project} />
          
          {/* Project Integrations */}
          <ProjectIntegrations project={{ ...project, teamId: project.teamId }} />
          
          {/* Project Sync Configuration */}
          {project && (
            <ProjectSyncConfiguration
              project={{
                id: project.id,
                taskManagementTool: project.taskManagementTool,
                taskManagementConfig: project.taskManagementConfig,
              }}
              actions={projectActions || []}
              selectedActionIds={selectedActionIds}
              onSelectionChange={setSelectedActionIds}
            />
          )}
          
          {/* Team Members */}
          <Team projectId={projectId} />
        </Stack>
      </Drawer>
    </>
  );
}
