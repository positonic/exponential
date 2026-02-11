'use client';

import { Button, Group, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { api } from '~/trpc/react';
import { EPIC_PRIORITY_OPTIONS } from '~/types/epic';
import { notifications } from '@mantine/notifications';

interface CreateEpicModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId?: string;
  onCreated?: (epic: { id: string; name: string }) => void;
}

export function CreateEpicModal({ opened, onClose, workspaceId, onCreated }: CreateEpicModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [targetDate, setTargetDate] = useState<Date | null>(null);

  const createEpic = api.epic.create.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Epic Created',
        message: `"${data.name}" has been created`,
        color: 'green',
        autoClose: 3000,
      });
      onCreated?.({ id: data.id, name: data.name });
      resetForm();
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to Create Epic',
        message: error.message,
        color: 'red',
        autoClose: 5000,
      });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setPriority('MEDIUM');
    setStartDate(null);
    setTargetDate(null);
  };

  const handleSubmit = () => {
    if (!name.trim() || !workspaceId) return;

    createEpic.mutate({
      workspaceId,
      name: name.trim(),
      description: description.trim() || undefined,
      priority: priority as "HIGH" | "MEDIUM" | "LOW" | "NONE",
      startDate: startDate ?? undefined,
      targetDate: targetDate ?? undefined,
    });
  };

  const inputStyles = {
    input: {
      backgroundColor: 'var(--color-surface-secondary)',
      color: 'var(--color-text-primary)',
      borderColor: 'var(--color-border-primary)',
    },
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create Epic"
      size="md"
      styles={{
        content: {
          backgroundColor: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
        },
        header: {
          backgroundColor: 'var(--color-bg-elevated)',
          color: 'var(--color-text-primary)',
        },
      }}
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Epic name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          styles={inputStyles}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          autoFocus
        />

        <Textarea
          label="Description"
          placeholder="What does this epic cover?"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={3}
          styles={inputStyles}
        />

        <Select
          label="Priority"
          value={priority}
          onChange={(val) => setPriority(val ?? 'MEDIUM')}
          data={EPIC_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          styles={inputStyles}
        />

        <Group grow>
          <DateInput
            label="Start Date"
            value={startDate}
            onChange={setStartDate}
            placeholder="Optional"
            clearable
            styles={inputStyles}
          />
          <DateInput
            label="Target Date"
            value={targetDate}
            onChange={setTargetDate}
            placeholder="Optional"
            clearable
            styles={inputStyles}
          />
        </Group>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={createEpic.isPending}
            disabled={!name.trim() || !workspaceId}
          >
            Create Epic
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
