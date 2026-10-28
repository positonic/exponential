'use client';

import { useState } from 'react';
import { Combobox, InputBase, Select } from '@mantine/core';
import type { ComboboxItem, MantineColor } from '@mantine/core';
import { pillTint } from './pillTint';

interface PillSelectProps {
  value: string;
  data: ComboboxItem[];
  /** Mantine palette colour tinting the pill, e.g. `green` for Active. */
  color: MantineColor;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * An in-place editable value shown as a tinted pill: the Status / Priority
 * cells of a list-page table. Picking the current value again is a no-op.
 *
 * A list page renders two or three of these per row, and a Mantine Select is
 * a Combobox store, a Popover and a hidden input apiece: on a 650-ticket
 * backlog that was ~2,000 of them, most of the table's render cost. So the
 * pill renders as a plain button styled like the Select's input, and swaps
 * in the real Select, already open, the first time it is activated.
 */
export function PillSelect({
  value,
  data,
  color,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: PillSelectProps) {
  const [activated, setActivated] = useState(false);

  const styles = {
    input: {
      ...pillTint(color),
      fontWeight: 500,
      border: 'none',
    },
  };

  if (!activated) {
    const activate = () => setActivated(true);
    return (
      <InputBase
        component="button"
        type="button"
        pointer
        variant="filled"
        size="xs"
        rightSection={<Combobox.Chevron size="xs" />}
        rightSectionPointerEvents="none"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            activate();
          }
        }}
        // A button centres and wraps its label; the Select's input does
        // neither.
        styles={{
          input: {
            ...styles.input,
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }}
      >
        {data.find((d) => d.value === value)?.label ?? value}
      </InputBase>
    );
  }

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
      autoFocus
      defaultDropdownOpened
      styles={styles}
    />
  );
}
