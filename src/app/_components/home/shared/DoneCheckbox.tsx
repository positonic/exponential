'use client';

import { useState } from 'react';
import { Checkbox } from '@mantine/core';

interface DoneCheckboxProps {
  /** Accessible name, e.g. "Mark mention done". */
  label: string;
  /** Marks the item done. The row usually unmounts once its query refetches. */
  onDone: () => Promise<unknown>;
}

/**
 * The tick box at the right edge of a home row. It is the ONLY thing that
 * marks a row done — opening the row's link never does. Ticks immediately so
 * the click feels instant, and un-ticks if the mutation fails.
 */
export function DoneCheckbox({ label, onDone }: DoneCheckboxProps) {
  const [checked, setChecked] = useState(false);

  const handleChange = () => {
    if (checked) return;
    setChecked(true);
    onDone().catch(() => setChecked(false));
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
