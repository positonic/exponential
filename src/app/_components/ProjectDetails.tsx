'use client';

import { Text, Badge, Group, Stack, Card } from '@mantine/core';
import { CreateProjectModal } from './CreateProjectModal';
import { type RouterOutputs } from "~/trpc/react";
import { IconFileText, IconFlag, IconTrendingUp } from '@tabler/icons-react';

type Project = RouterOutputs["project"]["getById"];

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active': return 'green';
    case 'completed': return 'blue';
    case 'paused': return 'yellow';
    case 'cancelled': return 'red';
    default: return 'gray';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'high': return 'red';
    case 'medium': return 'yellow';
    case 'low': return 'green';
    case 'urgent': return 'red';
    default: return 'gray';
  }
};

export default function ProjectDetails({ project }: { project: Project }) {

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <Stack gap="xs">
      <Group gap="xs" align="center">
        <IconFileText size={16} className="text-brand-primary" />
        <Text size="sm" fw={600} className="text-brand-primary">
          PROJECT DETAILS
        </Text>
      </Group>
      
      <Card withBorder p="lg" radius="lg" className="bg-surface-secondary border-border-primary">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Text size="lg" fw={600} c="bright">
              Project Information
            </Text>
            <CreateProjectModal project={project}>
              <Badge 
                size="lg"
                variant="gradient" 
                gradient={{ from: 'blue', to: 'indigo', deg: 45 }}
                className="cursor-pointer hover:scale-105 transition-transform"
              >
                EDIT
              </Badge>
            </CreateProjectModal>
          </Group>

          <Stack gap="md">
            {/* Description */}
            <div>
              <Group gap="xs" mb="xs">
                <IconFileText size={14} className="text-text-secondary" />
                <Text size="sm" fw={500} className="text-text-secondary">
                  Description
                </Text>
              </Group>
              <Text size="sm" c="dimmed" pl="md">
                {project.description || 'No description provided'}
              </Text>
            </div>

            {/* Status & Priority */}
            <Group grow>
              <div>
                <Group gap="xs" mb="xs">
                  <IconTrendingUp size={14} className="text-text-secondary" />
                  <Text size="sm" fw={500} className="text-text-secondary">
                    Status
                  </Text>
                </Group>
                <Badge 
                  size="md"
                  color={getStatusColor(project.status)}
                  variant="light"
                  className="ml-4"
                >
                  {project.status}
                </Badge>
              </div>

              <div>
                <Group gap="xs" mb="xs">
                  <IconFlag size={14} className="text-text-secondary" />
                  <Text size="sm" fw={500} className="text-text-secondary">
                    Priority
                  </Text>
                </Group>
                <Badge 
                  size="md"
                  color={getPriorityColor(project.priority)}
                  variant="light"
                  className="ml-4"
                >
                  {project.priority}
                </Badge>
              </div>
            </Group>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
} 