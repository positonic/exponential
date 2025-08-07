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
import { api } from '~/trpc/react';
import { IconEdit } from '@tabler/icons-react';

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

          <Group justify="flex-end">
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
        </Stack>
      </Modal>
    </>
  );
}