'use client';

import { Select } from '@mantine/core';
import type { ComboboxItem, MantineColor } from '@mantine/core';

interface PillSelectProps {
  value: string;
  data: ComboboxItem[];
  /** Mantine palette colour tinting the pill, e.g. `green` for Active. */
  color: MantineColor;
  /** Secondary text instead of the tint colour, for "None"-style values. */
  muted?: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

// Neutral palettes whose "filled" shade has too little contrast on their own
// light tint (gray in the light theme; dark is near-invisible in the dark
// theme). Their text uses the secondary text token instead.
const NEUTRAL_COLORS = new Set<string>(['gray', 'dark']);

/**
 * An in-place editable value shown as a tinted pill: the Status / Priority
 * cells of a list-page table. Picking the current value again is a no-op.
 */
export function PillSelect({
  value,
  data,
  color,
  muted = false,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: PillSelectProps) {
  return (
    <Select
      value={value}
      onChange={(next) => {
        if (next) onChange(next);
      }}
      data={data}
      disabled={disabled}
      aria-label={ariaLabel}
      variant="filled"
      size="xs"
      styles={{
        input: {
          backgroundColor: `var(--mantine-color-${color}-light)`,
          color:
            muted || NEUTRAL_COLORS.has(color)
              ? 'var(--color-text-secondary)'
              : `var(--mantine-color-${color}-filled)`,
          fontWeight: 500,
          border: 'none',
        },
      }}
    />
  );
}
