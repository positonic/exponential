'use client';

import { Button, Group, Modal, Select, Stack, TextInput, Textarea, Input } from '@mantine/core';
import { UnifiedDatePicker } from '~/app/_components/UnifiedDatePicker';
import { useState } from 'react';
import { api } from '~/trpc/react';
import { EPIC_PRIORITY_OPTIONS } from '~/types/epic';
import { notifications } from '@mantine/notifications';

interface CreateEpicModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId?: string;
  /**
   * The product this epic belongs to. Pass it from a product-scoped surface
   * (the Epics tab, a ticket) to skip the picker. Omit it from surfaces with
   * no product of their own — the action modals — and the user picks one,
   * because every epic needs a product.
   */
  productId?: string;
  onCreated?: (epic: { id: string; name: string }) => void;
}

export function CreateEpicModal({ opened, onClose, workspaceId, productId, onCreated }: CreateEpicModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);

  const needsProductPicker = !productId;
  const { data: products } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: opened && needsProductPicker && !!workspaceId },
  );
  const effectiveProductId = productId ?? pickedProductId;

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
    setPickedProductId(null);
  };

  const handleSubmit = () => {
    if (!name.trim() || !workspaceId || !effectiveProductId) return;

    createEpic.mutate({
      workspaceId,
      productId: effectiveProductId,
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

        {needsProductPicker && (
          <Select
            label="Product"
            placeholder={products ? 'Select a product' : 'Loading…'}
            value={pickedProductId}
            onChange={setPickedProductId}
            data={(products ?? []).map((p) => ({ value: p.id, label: p.name }))}
            required
            searchable
            nothingFoundMessage="No products in this workspace"
            styles={inputStyles}
          />
        )}

        <Select
          label="Priority"
          value={priority}
          onChange={(val) => setPriority(val ?? 'MEDIUM')}
          data={EPIC_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          styles={inputStyles}
        />

        <Group grow>
          <Input.Wrapper label="Start Date">
            <div>
              <UnifiedDatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Optional"
                notificationContext="epic"
              />
            </div>
          </Input.Wrapper>
          <Input.Wrapper label="Target Date">
            <div>
              <UnifiedDatePicker
                value={targetDate}
                onChange={setTargetDate}
                placeholder="Optional"
                notificationContext="epic"
              />
            </div>
          </Input.Wrapper>
        </Group>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={createEpic.isPending}
            disabled={!name.trim() || !workspaceId || !effectiveProductId}
          >
            Create Epic
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
