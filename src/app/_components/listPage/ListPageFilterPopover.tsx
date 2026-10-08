'use client';

import { Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { ListPageButton } from './ListPageTopBar';

export interface ListPageFilterFacet<K extends string> {
  key: K;
  label: string;
}

export interface ListPageFilterOption {
  value: string;
  label: string;
}

/**
 * The toolbar's Filter button and its popover: one row of toggle chips per
 * facet, any number selected. A facet with no options is left out. The
 * applied values are named back to the user by `ListPageFilterPills`.
 */
export function ListPageFilterPopover<K extends string>({
  facets,
  options,
  selected,
  activeCount,
  onToggle,
  onClear,
  'aria-label': ariaLabel,
}: {
  facets: ReadonlyArray<ListPageFilterFacet<K>>;
  options: Record<K, ListPageFilterOption[]>;
  selected: Record<K, string[]>;
  activeCount: number;
  onToggle: (key: K, value: string) => void;
  onClear: () => void;
  'aria-label': string;
}) {
  return (
    <Popover position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <ListPageButton active={activeCount > 0} count={activeCount} aria-label={ariaLabel}>
          <IconFilter size={13} stroke={1.75} />
          Filter
        </ListPageButton>
      </Popover.Target>
      <Popover.Dropdown
        styles={{
          dropdown: {
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            minWidth: 240,
            maxWidth: 280,
            maxHeight: 440,
            overflowY: 'auto',
          },
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <Text size="xs" fw={600} className="text-text-primary">Filter</Text>
          {activeCount > 0 && (
            <UnstyledButton onClick={onClear} className="text-[10px] text-text-muted hover:text-text-primary">
              Clear all
            </UnstyledButton>
          )}
        </div>
        <Stack gap="sm">
          {facets.map((facet) => {
            const opts = options[facet.key];
            if (opts.length === 0) return null;
            const sel = selected[facet.key];
            return (
              <div key={facet.key}>
                <Text size="xs" className="text-text-muted mb-1.5">{facet.label}</Text>
                <div className="flex flex-wrap gap-1">
                  {opts.map((o) => {
                    const on = sel.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onToggle(facet.key, o.value)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          on
                            ? 'bg-brand-primary text-white'
                            : 'bg-surface-hover text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
