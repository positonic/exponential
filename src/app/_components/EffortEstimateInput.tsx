'use client';

import { Button, Group, NumberInput, Popover, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconFlame } from '@tabler/icons-react';
import { useState } from 'react';
import {
  type EffortUnit,
  STORY_POINT_OPTIONS,
  T_SHIRT_OPTIONS,
  effortToLabel,
} from '~/types/effort';

interface EffortEstimateInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  effortUnit: EffortUnit;
}

export function EffortEstimateInput({ value, onChange, effortUnit }: EffortEstimateInputProps) {
  const [opened, setOpened] = useState(false);

  const displayLabel = value != null ? effortToLabel(value, effortUnit) : 'Effort';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={280}
      shadow="md"
    >
      <Popover.Target>
        <Button
          variant={value != null ? 'light' : 'subtle'}
          color={value != null ? 'orange' : 'gray'}
          size="sm"
          leftSection={<IconFlame size={16} />}
          onClick={() => setOpened(true)}
        >
          {displayLabel}
        </Button>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            {effortUnit === 'STORY_POINTS' && 'Story Points'}
            {effortUnit === 'T_SHIRT' && 'T-shirt Size'}
            {effortUnit === 'HOURS' && 'Hours Estimate'}
          </Text>

          {effortUnit === 'STORY_POINTS' && (
            <SegmentedControl
              value={value != null ? String(value) : ''}
              onChange={(val) => onChange(val ? Number(val) : null)}
              data={STORY_POINT_OPTIONS.map((p) => ({
                value: String(p),
                label: String(p),
              }))}
              size="xs"
              fullWidth
            />
          )}

          {effortUnit === 'T_SHIRT' && (
            <SegmentedControl
              value={value != null ? String(value) : ''}
              onChange={(val) => onChange(val ? Number(val) : null)}
              data={T_SHIRT_OPTIONS.map((o) => ({
                value: String(o.value),
                label: o.label,
              }))}
              size="xs"
              fullWidth
            />
          )}

          {effortUnit === 'HOURS' && (
            <NumberInput
              value={value ?? ''}
              onChange={(val) => onChange(typeof val === 'number' ? val : null)}
              min={0.5}
              step={0.5}
              max={999}
              placeholder="Hours"
              size="sm"
              styles={{
                input: {
                  backgroundColor: 'var(--color-surface-secondary)',
                  color: 'var(--color-text-primary)',
                  borderColor: 'var(--color-border-primary)',
                },
              }}
            />
          )}

          <Group justify="flex-end" gap="xs">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                onChange(null);
                setOpened(false);
              }}
            >
              Clear
            </Button>
            <Button size="xs" onClick={() => setOpened(false)}>
              Done
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
