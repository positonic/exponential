"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { DateTimeField } from "~/app/_components/DateTimeField";

interface OccurrenceDateModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  /** What the choice does, under the field. */
  hint?: string;
  submitLabel: string;
  /** Starting value when the modal opens. */
  initial: Date | null;
  loading?: boolean;
  onSubmit: (scheduledStart: Date) => void;
}

/**
 * Pick a date and time for one occurrence (ADR-0059 amendment, 2026-10-21):
 * "Add occurrence" on the ceremony page and "Move" on the occurrence page
 * share it. The caller owns the mutation and closes the modal on success.
 */
export function OccurrenceDateModal({
  opened,
  onClose,
  title,
  hint,
  submitLabel,
  initial,
  loading = false,
  onSubmit,
}: OccurrenceDateModalProps) {
  const [value, setValue] = useState<Date | null>(initial);
  useEffect(() => {
    if (opened) setValue(initial);
  }, [opened, initial]);

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" centered>
      <Stack gap="sm">
        <DateTimeField
          label="When"
          value={value}
          onChange={setValue}
          valueFormat="ddd D MMM YYYY, HH:mm"
          data-testid="occurrence-date-field"
        />
        {hint && (
          <Text size="xs" className="text-text-muted">
            {hint}
          </Text>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => value && onSubmit(value)}
            disabled={!value}
            loading={loading}
            data-testid="occurrence-date-submit"
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
