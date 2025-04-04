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
  IconUsers,
  IconMessageCircle,
  IconClipboardList
} from '@tabler/icons-react';

type TaskView = 'list' | 'alignment';
type TabValue = 'tasks' | 'team' | 'chat' | 'settings' | 'plan' | 'workflows';

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
    <Tabs value={activeTab} onChange={handleTabChange}>
      <Stack gap="xl" align="stretch" justify="flex-start">
        {/* Project Title and Description */}
        <Paper p="md" bg="transparent" style={{ border: 'none' }}>
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
        <Tabs.List>
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

        {/* Content Area - No longer needs extra padding if Tabs.List is outside */}
        <Tabs.Panel value="tasks">
          <Actions viewName={viewName} defaultView={taskView} projectId={projectId} />
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
      </Stack>
    </Tabs>
  );
} 