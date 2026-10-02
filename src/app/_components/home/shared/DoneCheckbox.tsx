'use client';

import { useState } from 'react';
import { Checkbox } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { reportHandledError } from '~/lib/reportHandledError';

/**
 * The `action.update` patch that completes an action. The server only syncs
 * kanban → status, not the reverse, so a project action has to move its own
 * card to DONE or it would sit completed in its old board column.
 */
export function completeActionPatch(action: {
  id: string;
  projectId: string | null;
}) {
  return {
    id: action.id,
    status: 'COMPLETED' as const,
    ...(action.projectId ? { kanbanStatus: 'DONE' as const } : {}),
  };
}

interface DoneCheckboxProps {
  /** Accessible name, e.g. "Mark mention done". */
  label: string;
  /** Marks the item done. The row usually unmounts once its query refetches. */
  onDone: () => Promise<unknown>;
}

/**
 * The tick box at the right edge of a home row. It is the ONLY thing that
 * marks a row done — opening the row's link never does. Ticks immediately so
 * the click feels instant, and un-ticks (and says why) if the mutation fails.
 */
export function DoneCheckbox({ label, onDone }: DoneCheckboxProps) {
  const [checked, setChecked] = useState(false);

  const handleChange = () => {
    if (checked) return;
    setChecked(true);
    onDone().catch((error: unknown) => {
      setChecked(false);
      reportHandledError(error, {
        area: 'home-done-checkbox',
        context: { label },
      });
      notifications.show({
        color: 'red',
        title: "Couldn't mark it done",
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    });
  };

  return (
    <Checkbox
      size="xs"
      radius="xl"
      aria-label={label}
      title={label}
      checked={checked}
      onChange={handleChange}
      styles={{ input: { cursor: 'pointer' } }}
    />
  );
}
