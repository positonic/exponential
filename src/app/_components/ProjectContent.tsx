'use client';

import { useState } from 'react';
import { Actions } from './Actions';
import ProjectDetails from './ProjectDetails';
import Chat from './Chat';
import { Team } from './Team';
import { Plan } from './Plan';
import { Group, Tabs, SegmentedControl, Title, Paper, Stack, Text, Box } from '@mantine/core';
import { api } from "~/trpc/react";
import { 
  IconLayoutKanban, 
  IconSettings, 
  IconAlignCenter,
  IconListCheck,
  IconUsers,
  IconMessageCircle,
  IconClipboardList
} from '@tabler/icons-react';

type TaskView = 'list' | 'alignment';
type TabValue = 'tasks' | 'team' | 'chat' | 'settings' | 'plan';

export function ProjectContent({ viewName, projectId }: { viewName: string, projectId: string }) {
  const [activeTab, setActiveTab] = useState<TabValue>('tasks');
  const [taskView, setTaskView] = useState<TaskView>('list');
  const { data: project, isLoading } = api.project.getById.useQuery({ id: projectId });

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value as TabValue);
    }
  };

  const handleViewChange = (value: string) => {
    setTaskView(value as TaskView);
  };

  if (isLoading) {
    return <div>Loading project...</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <Stack gap={0} align="stretch" justify="flex-start">
      <Box 
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(28, 28, 28, 0.95)',
          borderBottom: '1px solid rgba(82, 82, 82, 0.2)',
          marginBottom: '2rem'
        }}
      >
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Paper p="md" bg="transparent" style={{ border: 'none' }}>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title 
                    order={2} 
                    mb={4}
                    className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent"
                  >
                    {project.name}
                  </Title>
                  <Text size="sm" c="dimmed" lineClamp={2} maw={600}>
                    {project.description}
                  </Text>
                </div>
                <Tabs.List 
                  style={{
                    border: '1px solid rgba(82, 82, 82, 0.3)',
                    borderRadius: '8px',
                    padding: '4px',
                    backgroundColor: 'rgba(45, 45, 45, 0.5)'
                  }}
                >
                  <Tabs.Tab 
                    value="tasks" 
                    leftSection={<IconLayoutKanban size={16} />}
                  >
                    Tasks
                  </Tabs.Tab>
                  <Tabs.Tab 
                    value="plan" 
                    leftSection={<IconClipboardList size={16} />}
                  >
                    Plan
                  </Tabs.Tab>
                  <Tabs.Tab 
                    value="team" 
                    leftSection={<IconUsers size={16} />}
                  >
                    Team
                  </Tabs.Tab>
                  <Tabs.Tab 
                    value="chat" 
                    leftSection={<IconMessageCircle size={16} />}
                  >
                    Chat
                  </Tabs.Tab>
                  <Tabs.Tab 
                    value="settings" 
                    leftSection={<IconSettings size={16} />}
                  >
                    Settings
                  </Tabs.Tab>
                </Tabs.List>
              </Group>

              
            </Stack>
          </Paper>

          {/* Content Area */}
          <Box p="md">
            <Tabs.Panel value="tasks">
              <Actions viewName={viewName} defaultView={taskView} />
            </Tabs.Panel>

            <Tabs.Panel value="plan">
              <Plan projectId={projectId} />
            </Tabs.Panel>

            <Tabs.Panel value="team">
              <Team projectId={projectId} />
            </Tabs.Panel>

            <Tabs.Panel value="chat">
              <Chat />
            </Tabs.Panel>

            <Tabs.Panel value="settings">
              <ProjectDetails project={project} />
            </Tabs.Panel>
          </Box>
        </Tabs>
      </Box>
    </Stack>
  );
} 