'use client';

import { useState } from 'react';
import {
  Modal,
  Button,
  Group,
  Stack,
  Title,
  Text,
  Card,
  Badge,
  Checkbox,
  Alert,
  LoadingOverlay
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api } from "~/trpc/react";
import { IconInfoCircle } from '@tabler/icons-react';

interface AssignProjectToTeamModalProps {
  children: React.ReactNode;
  teamId: string;
  onProjectsAssigned?: () => void;
}

export function AssignProjectToTeamModal({ children, teamId, onProjectsAssigned }: AssignProjectToTeamModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const utils = api.useUtils();

  // Fetch unassigned projects
  const { data: unassignedProjects, isLoading } = api.project.getUnassignedProjects.useQuery();

  const assignMutation = api.project.assignToTeam.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Projects Assigned',
        message: `${selectedProjects.length} project(s) assigned to team successfully.`,
        color: 'green',
      });
      
      // Reset selection
      setSelectedProjects([]);
      
      // Invalidate queries to refresh data
      void utils.team.getBySlug.invalidate();
      void utils.project.getAll.invalidate();
      void utils.project.getUnassignedProjects.invalidate();
      
      onProjectsAssigned?.();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to assign projects to team',
        color: 'red',
      });
    },
  });

  const handleProjectToggle = (projectId: string) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleSubmit = async () => {
    if (selectedProjects.length === 0) {
      notifications.show({
        title: 'No Projects Selected',
        message: 'Please select at least one project to assign.',
        color: 'orange',
      });
      return;
    }

    // Assign projects one by one
    for (const projectId of selectedProjects) {
      await assignMutation.mutateAsync({
        projectId,
        teamId,
      });
    }
  };

  const handleClose = () => {
    setSelectedProjects([]);
    close();
  };

  return (
    <>
      <div onClick={open}>
        {children}
      </div>

      <Modal 
        opened={opened} 
        onClose={handleClose}
        size="lg"
        title="Assign Existing Projects to Team"
      >
        <Stack gap="md">
          <Alert icon={<IconInfoCircle size={16} />} color="blue">
            Select existing projects to assign to this team. Only projects that aren't already assigned to a team are shown.
          </Alert>

          <div style={{ position: 'relative', minHeight: 200 }}>
            <LoadingOverlay visible={isLoading} />
            
            {unassignedProjects && unassignedProjects.length > 0 ? (
              <Stack gap="sm">
                {unassignedProjects.map((project) => (
                  <Card key={project.id} withBorder p="sm" style={{ cursor: 'pointer' }}>
                    <Group justify="space-between" onClick={() => handleProjectToggle(project.id)}>
                      <Group>
                        <Checkbox
                          checked={selectedProjects.includes(project.id)}
                          onChange={() => handleProjectToggle(project.id)}
                        />
                        <div>
                          <Text fw={500}>{project.name}</Text>
                          <Text size="sm" c="dimmed">
                            {project.description || 'No description'}
                          </Text>
                          <Group gap="xs" mt="xs">
                            <Badge size="xs" variant="light">{project.status}</Badge>
                            <Badge size="xs" variant="outline">{project.priority}</Badge>
                          </Group>
                        </div>
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            ) : !isLoading ? (
              <Text c="dimmed" ta="center" py="xl">
                No unassigned projects found. All your projects are either already assigned to teams or you haven't created any projects yet.
              </Text>
            ) : null}
          </div>

          <Group justify="space-between" mt="md">
            <Text size="sm" c="dimmed">
              {selectedProjects.length > 0 
                ? `${selectedProjects.length} project(s) selected`
                : 'No projects selected'
              }
            </Text>
            
            <Group>
              <Button variant="light" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                loading={assignMutation.isPending}
                disabled={selectedProjects.length === 0}
              >
                Assign Projects
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}