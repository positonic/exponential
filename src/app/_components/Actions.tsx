"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Select, TextInput, Textarea, Button, Paper, Stack, Group } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';

export function Actions() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("");

  const utils = api.useUtils();
  const actions = api.action.getAll.useQuery();
  
  const projects = api.project.getAll.useQuery();

  const createAction = api.action.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setProjectId("");
      setPriority("");
      void utils.action.getAll.invalidate();
    },
  });

  const priorityData = [
    { value: 'Quick', label: 'Quick ⚡', color: '#FFE5E5' },
    { value: 'Scheduled', label: 'Scheduled 📅', color: '#FFE5F7' },
    { value: '1st Priority', label: '1st Priority', color: '#FFE5D3' },
    { value: '2nd Priority', label: '2nd Priority', color: '#E2FFE5' },
    { value: '3rd Priority', label: '3rd Priority', color: '#E5F0FF' },
    { value: '4th Priority', label: '4th Priority', color: '#F2F2F2' },
    { value: '5th Priority', label: '5th Priority', color: '#F8F8F8' },
    { value: 'Errand', label: 'Errand', color: '#F0E5FF' },
    { value: 'Remember', label: 'Remember 🔄', color: '#FFE5F7' },
    { value: 'Watch', label: 'Watch', color: '#F5F5F5' },
    { value: 'Someday Maybe', label: 'Someday Maybe', color: '#FFF9E5' },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-4">
        <CreateActionModal />
      </div>
      
      <Paper withBorder p="md" radius="md" className="mb-8">
        <Stack gap="md">
          <TextInput
            placeholder="Action name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          
          <Textarea
            placeholder="Action description"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minRows={2}
          />

          <Select
            label="Project"
            placeholder="Select a project"
            value={projectId}
            onChange={(value) => setProjectId(value ?? '')}
            data={projects.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
          />

          <Select
            label="Priority"
            value={priority}
            onChange={(value) => setPriority(value ?? '')}
            data={priorityData}
            clearable
            searchable
          />

          <Group justify="flex-end">
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                createAction.mutate({
                  name,
                  description,
                  projectId,
                  priority,
                });
              }}
              loading={createAction.isLoading}
            >
              Add Action
            </Button>
          </Group>
        </Stack>
      </Paper>

      <ActionList actions={actions.data ?? []} />
    </div>
  );
} 