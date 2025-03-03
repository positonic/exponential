'use client';

import { useState } from 'react';
import { Actions } from './Actions';
import ProjectDetails from './ProjectDetails';
import Chat from './Chat';
import { Team } from './Team';
import { Group } from '@mantine/core';
import { api } from "~/trpc/react";

export function ProjectContent({ viewName, projectId }: { viewName: string, projectId: string }) {
  const [mode, setMode] = useState<'focus' | 'manage'>('focus');
  const { data: project, isLoading } = api.project.getById.useQuery({ id: projectId });

  if (isLoading) {
    return <div>Loading project...</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="w-full">
      <Group justify="space-between" mb="xl">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <button
          onClick={() => setMode(mode === 'focus' ? 'manage' : 'focus')}
          className="text-gray-400 hover:text-gray-300 transition-colors"
        >
          {mode === 'focus' ? 'Manage' : 'Focus'}
        </button>
      </Group>

      {mode === 'focus' ? (
        <Actions viewName={viewName} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            <ProjectDetails project={project} />
            <Team projectId={projectId} />
          </div>
          <Chat />
        </div>
      )}
    </div>
  );
} 