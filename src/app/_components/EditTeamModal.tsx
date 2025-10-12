'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { api } from '~/trpc/react';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

interface EditTeamModalProps {
  team: {
    id: string;
    name: string;
    description?: string | null;
  };
  onTeamUpdated?: () => void;
}

export function EditTeamModal({ team, onTeamUpdated }: EditTeamModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || '');
  const router = useRouter();

  const utils = api.useUtils();

  const updateTeam = api.team.update.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Team Updated',
        message: 'Team details have been updated successfully.',
        color: 'green',
      });
      
      // Invalidate relevant queries
      void utils.team.getBySlug.invalidate();
      void utils.team.list.invalidate();
      
      onTeamUpdated?.();
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update team',
        color: 'red',
      });
    },
  });

  const deleteTeam = api.team.delete.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Team Deleted',
        message: 'Team has been deleted successfully.',
        color: 'green',
      });
      
      // Invalidate relevant queries
      void utils.team.list.invalidate();
      
      // Navigate to teams list
      router.push('/teams');
      close();
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete team',
        color: 'red',
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Team name is required',
        color: 'red',
      });
      return;
    }

    updateTeam.mutate({
      teamId: team.id,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const handleClose = () => {
    // Reset form to original values
    setName(team.name);
    setDescription(team.description || '');
    close();
  };

  const handleDeleteTeam = () => {
    modals.openConfirmModal({
      title: 'Delete Team',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{team.name}</strong>? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteTeam.mutate({ teamId: team.id }),
    });
  };

  return (
    <>
      <Button
        variant="light"
        size="sm"
        leftSection={<IconEdit size={16} />}
        onClick={open}
      >
        Edit Team
      </Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title="Edit Team"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Team Name"
            placeholder="Enter team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            data-autofocus
          />

          <Textarea
            label="Description"
            placeholder="Enter team description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minRows={3}
            autosize
          />

          <Text size="xs" c="dimmed">
            Only team owners and admins can edit team details.
          </Text>

          <Group justify="space-between">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={handleDeleteTeam}
              loading={deleteTeam.isPending}
            >
              Delete Team
            </Button>
            
            <Group>
              <Button variant="light" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                loading={updateTeam.isPending}
                disabled={!name.trim()}
              >
                Save Changes
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}