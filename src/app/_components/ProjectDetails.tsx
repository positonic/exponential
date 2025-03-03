'use client';

import { Paper, Text, Badge, Group } from '@mantine/core';
import { CreateProjectModal } from './CreateProjectModal';
import { type RouterOutputs } from "~/trpc/react";

type Project = RouterOutputs["project"]["getBySlug"];

export default function ProjectDetails({ project }: { project: Project }) {

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <Paper p="md" radius="sm" className="bg-[#262626]">
      <Group justify="space-between" mb="md">
        <Text size="xl" fw={700}>Project Details</Text>
        <CreateProjectModal project={project}>
          <Badge className="cursor-pointer">
            Edit
          </Badge>
        </CreateProjectModal>
      </Group>

      <div className="space-y-4">
        <div>
          <Text size="sm" c="dimmed">Description</Text>
          <Text>{project.description}</Text>
        </div>

        <div>
          <Text size="sm" c="dimmed">Status</Text>
          <Badge>{project.status}</Badge>
        </div>

        <div>
          <Text size="sm" c="dimmed">Priority</Text>
          <Badge>{project.priority}</Badge>
        </div>

        <div>
          <Text size="sm" c="dimmed">Goals</Text>
          <div className="flex flex-wrap gap-2">
            {project.goals?.map((goal) => (
              <Badge key={goal.id}>{goal.title}</Badge>
            ))}
          </div>
        </div>

        <div>
          <Text size="sm" c="dimmed">Outcomes</Text>
          <div className="flex flex-wrap gap-2">
            {project.outcomes?.map((outcome) => (
              <Badge key={outcome.id}>{outcome.description}</Badge>
            ))}
          </div>
        </div>
      </div>
    </Paper>
  );
} 