'use client';

import { useState } from 'react';
import {
  Modal,
  TextInput,
  Textarea,
  Button,
  Group,
  Select,
  MultiSelect,
  Stack,
  Title
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";

type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
type ProjectPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

interface AddProjectToTeamModalProps {
  children: React.ReactNode;
  teamId: string;
  onProjectAdded?: () => void;
}

export function AddProjectToTeamModal({ children, teamId, onProjectAdded }: AddProjectToTeamModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("ACTIVE");
  const [priority, setPriority] = useState<ProjectPriority>("NONE");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>([]);

  const utils = api.useUtils();

  // Fetch goals and outcomes for the select boxes
  const { data: goals } = api.goal.getAllMyGoals.useQuery();
  const { data: outcomes } = api.outcome.getMyOutcomes.useQuery();

  const createMutation = api.project.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Project Added',
        message: 'Project has been added to the team successfully.',
        color: 'green',
      });
      
      // Reset form
      setProjectName("");
      setDescription("");
      setStatus("ACTIVE");
      setPriority("NONE");
      setSelectedGoals([]);
      setSelectedOutcomes([]);
      
      // Invalidate queries to refresh the team data
      void utils.team.getBySlug.invalidate();
      void utils.project.getAll.invalidate();
      
      onProjectAdded?.();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to add project to team',
        color: 'red',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: projectName,
      description,
      status,
      priority,
      goalIds: selectedGoals,
      outcomeIds: selectedOutcomes,
      teamId,
    });
  };

  return (
    <>
      <div onClick={open}>
        {children}
      </div>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        title="Add Project to Team"
      >
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Project Name"
              placeholder="Enter project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
            />
            
            <Textarea
              label="Description"
              placeholder="Enter project description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Select
              label="Status"
              data={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'ON_HOLD', label: 'On Hold' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
              value={status}
              onChange={(value) => setStatus(value as ProjectStatus)}
              required
            />

            <Select
              label="Priority"
              data={[
                { value: 'NONE', label: 'None' },
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
              ]}
              value={priority}
              onChange={(value) => setPriority(value as ProjectPriority)}
              required
            />

            <MultiSelect
              data={goals?.map(goal => ({ value: goal.id.toString(), label: goal.title })) ?? []}
              value={selectedGoals}
              onChange={setSelectedGoals}
              label="Link to Goals"
              placeholder="Select goals (optional)"
              searchable
            />

            <MultiSelect
              data={outcomes?.map(outcome => ({ value: outcome.id.toString(), label: outcome.description })) ?? []}
              value={selectedOutcomes}
              onChange={setSelectedOutcomes}
              label="Link to Outcomes"
              placeholder="Select outcomes (optional)"
              searchable
            />

            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={close}>
                Cancel
              </Button>
              <Button 
                type="submit"
                loading={createMutation.isPending}
              >
                Add Project
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}