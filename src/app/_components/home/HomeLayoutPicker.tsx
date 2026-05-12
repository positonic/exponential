'use client';

import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconActivity,
  IconCheck,
  IconCommand,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

export const HOME_LAYOUT_VALUES = ['command', 'activity'] as const;
export type HomeLayout = (typeof HOME_LAYOUT_VALUES)[number];

export const DEFAULT_HOME_LAYOUT: HomeLayout = 'command';

/**
 * Type guard for runtime values read out of the database or URL. Returns true
 * when `value` is one of `HOME_LAYOUT_VALUES`.
 */
export function isValidHomeLayout(value: unknown): value is HomeLayout {
  return (
    typeof value === 'string' &&
    (HOME_LAYOUT_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Coerce an arbitrary string (or null/undefined) into a known `HomeLayout`,
 * falling back to `DEFAULT_HOME_LAYOUT` when the value isn't recognised.
 * Use this anywhere the layout is read out of the DB or a query param so the
 * downstream code can rely on a narrowed union type.
 */
export function validateHomeLayout(
  value: string | null | undefined,
): HomeLayout {
  return isValidHomeLayout(value) ? value : DEFAULT_HOME_LAYOUT;
}

interface HomeLayoutPickerProps {
  value: HomeLayout;
  onChange: (value: HomeLayout) => void;
  disabled?: boolean;
}

interface Option {
  value: HomeLayout;
  label: string;
  description: string;
  icon: TablerIcon;
}

const OPTIONS: Option[] = [
  {
    value: 'command',
    label: 'Command center (default)',
    description: 'Search-first home with quick actions and recent work.',
    icon: IconCommand,
  },
  {
    value: 'activity',
    label: 'Activity dashboard',
    description:
      'Heatmap of contributions, activity feed, and weekly review at a glance.',
    icon: IconActivity,
  },
];

/**
 * Two-option radio-card picker for the workspace home page layout. Used in
 * `/workspaces/new` (workspace creation) and in Settings → General to switch
 * between the Command Center and Activity Dashboard home pages.
 *
 * @param props.value     Currently selected layout. Must be one of `HOME_LAYOUT_VALUES`.
 * @param props.onChange  Fired with the new layout when the user clicks an option.
 * @param props.disabled  When true, all options are unselectable and visually dimmed.
 * @returns A radio-group of layout option cards.
 *
 * @example
 * ```tsx
 * const [layout, setLayout] = useState<HomeLayout>(DEFAULT_HOME_LAYOUT);
 * <HomeLayoutPicker value={layout} onChange={setLayout} />
 * ```
 */
export function HomeLayoutPicker({
  value,
  onChange,
  disabled = false,
}: HomeLayoutPickerProps) {
  return (
    <Group
      gap="sm"
      role="radiogroup"
      aria-label="Home page layout"
      wrap="wrap"
      className="w-full"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <UnstyledButton
            key={option.value}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={[
              'flex-1 min-w-[240px] rounded-md border px-4 py-3 text-left transition-colors',
              selected
                ? 'border-border-focus bg-surface-hover'
                : 'border-border-primary bg-surface-primary hover:bg-surface-hover',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ].join(' ')}
          >
            <Stack gap={6}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="xs" align="center" wrap="nowrap">
                  <Icon
                    size={18}
                    className={selected ? 'text-brand-primary' : 'text-text-secondary'}
                  />
                  <Text size="sm" fw={500} className="text-text-primary">
                    {option.label}
                  </Text>
                </Group>
                {selected ? (
                  <IconCheck size={16} className="text-brand-primary" />
                ) : null}
              </Group>
              <Text size="xs" className="text-text-secondary">
                {option.description}
              </Text>
            </Stack>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
