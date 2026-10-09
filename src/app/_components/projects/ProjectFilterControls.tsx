'use client';

import { useMemo } from 'react';
import { Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import type { FilterMember, FilterState } from '~/types/filter';
import {
  DRI_ME,
  DRI_NONE,
  ETA_NONE,
  ETA_OVERDUE,
  ETA_SOON,
  ETA_SOON_DAYS,
  PROJECT_FILTER_KEYS,
  VISIBILITY_PUBLIC,
  VISIBILITY_RESTRICTED,
  type ProjectFilterKey,
} from './useProjectViewState';
import { ListPageButton, ListPageFilterPills } from '~/app/_components/listPage';

/**
 * Filter UI for the three project views (table, projects & tasks, timeline),
 * modelled on the product tickets backlog: one Filter button opening a popover
 * of facet sections with pill toggles, and a row of dismissable pills in the
 * toolbar naming every filter that is currently applied.
 */

interface FacetOption {
  value: string;
  /** Text on the toggle inside the popover. */
  label: string;
  /** Text on the toolbar pill once selected; defaults to `label`. */
  pill?: string;
}

interface Facet {
  key: ProjectFilterKey;
  label: string;
  /** Mantine colour of the toolbar pill, per value if it varies. */
  color: string | ((value: string) => string);
  options: FacetOption[];
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  ON_HOLD: 'yellow',
  COMPLETED: 'blue',
  CANCELLED: 'gray',
};

const STATUS_FACET: Facet = {
  key: 'status',
  label: 'Status',
  color: (v) => STATUS_COLORS[v] ?? 'gray',
  options: [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ],
};

const PRIORITY_FACET: Facet = {
  key: 'priority',
  label: 'Priority',
  color: 'grape',
  options: [
    { value: 'HIGH', label: 'High', pill: 'High priority' },
    { value: 'MEDIUM', label: 'Medium', pill: 'Medium priority' },
    { value: 'LOW', label: 'Low', pill: 'Low priority' },
    { value: 'NONE', label: 'None', pill: 'No priority' },
  ],
};

const VISIBILITY_FACET: Facet = {
  key: 'visibility',
  label: 'Visibility',
  color: 'teal',
  options: [
    { value: VISIBILITY_PUBLIC, label: 'Public' },
    { value: VISIBILITY_RESTRICTED, label: 'Restricted' },
  ],
};

const ETA_FACET: Facet = {
  key: 'eta',
  label: 'ETA',
  color: 'orange',
  options: [
    { value: ETA_OVERDUE, label: 'Overdue' },
    { value: ETA_SOON, label: `Due in ${ETA_SOON_DAYS} days` },
    { value: ETA_NONE, label: 'No ETA' },
  ],
};

function memberLabel(m: FilterMember): string {
  return m.name ?? m.email ?? 'Unknown';
}

/** The facets in display order; the DRI one lists the workspace's members. */
export function buildProjectFilterFacets(members: FilterMember[]): Facet[] {
  const driFacet: Facet = {
    key: 'driId',
    label: 'DRI',
    color: 'brand',
    options: [
      { value: DRI_ME, label: 'Me', pill: 'My projects' },
      { value: DRI_NONE, label: 'Unassigned', pill: 'No DRI' },
      ...members.map((m) => ({
        value: m.id,
        label: memberLabel(m),
        pill: `DRI: ${memberLabel(m)}`,
      })),
    ],
  };
  return [STATUS_FACET, PRIORITY_FACET, driFacet, VISIBILITY_FACET, ETA_FACET];
}

function selectedValues(filters: FilterState, key: string): string[] {
  const val = filters[key];
  return Array.isArray(val) ? val : [];
}

function toggleValue(
  filters: FilterState,
  key: ProjectFilterKey,
  value: string,
): FilterState {
  const current = selectedValues(filters, key);
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...filters, [key]: next.length > 0 ? next : undefined };
}

/** How many filter values are applied across every project facet. */
export function countActiveProjectFilters(filters: FilterState): number {
  return PROJECT_FILTER_KEYS.reduce(
    (n, key) => n + selectedValues(filters, key).length,
    0,
  );
}

export interface ActiveProjectFilterPill {
  key: ProjectFilterKey;
  value: string;
  label: string;
  color: string;
}

/** One pill per applied value, in facet order, with its display label. */
export function describeActiveProjectFilters(
  filters: FilterState,
  members: FilterMember[],
): ActiveProjectFilterPill[] {
  const pills: ActiveProjectFilterPill[] = [];
  for (const facet of buildProjectFilterFacets(members)) {
    for (const value of selectedValues(filters, facet.key)) {
      const opt = facet.options.find((o) => o.value === value);
      // A DRI who has since left the workspace still gets a pill, so the
      // filter stays visible and removable rather than silently hiding rows.
      const label =
        opt?.pill ?? opt?.label ?? `${facet.label}: ${value}`;
      pills.push({
        key: facet.key,
        value,
        label,
        color:
          typeof facet.color === 'function' ? facet.color(value) : facet.color,
      });
    }
  }
  return pills;
}

interface ProjectFilterPopoverProps {
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  members: FilterMember[];
  /** facetKey → value → matching rows; shown beside an option when known. */
  counts?: Record<string, Record<string, number>>;
}

export function ProjectFilterPopover({
  filters,
  onFiltersChange,
  members,
  counts,
}: ProjectFilterPopoverProps) {
  const facets = useMemo(() => buildProjectFilterFacets(members), [members]);
  const activeCount = countActiveProjectFilters(filters);

  return (
    <Popover position="bottom-end" withinPortal shadow="md">
      <Popover.Target>
        <ListPageButton
          active={activeCount > 0}
          count={activeCount}
          aria-label="Filter projects"
        >
          <IconFilter size={13} stroke={1.75} />
          Filter
        </ListPageButton>
      </Popover.Target>
      <Popover.Dropdown
        styles={{
          dropdown: {
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-primary)',
            minWidth: 260,
            maxWidth: 320,
            maxHeight: 440,
            overflowY: 'auto',
          },
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <Text size="xs" fw={600} className="text-text-primary">
            Filter
          </Text>
          {activeCount > 0 && (
            <UnstyledButton
              onClick={() => onFiltersChange({})}
              className="text-[10px] text-text-muted hover:text-text-primary"
            >
              Clear all
            </UnstyledButton>
          )}
        </div>
        <Stack gap="sm">
          {facets.map((facet) => {
            const selected = selectedValues(filters, facet.key);
            const facetCounts = counts?.[facet.key];
            return (
              <div key={facet.key}>
                <Text size="xs" className="mb-1.5 text-text-muted">
                  {facet.label}
                </Text>
                <div className="flex flex-wrap gap-1">
                  {facet.options.map((opt) => {
                    const on = selected.includes(opt.value);
                    const n = facetCounts?.[opt.value];
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={on}
                        aria-label={n === undefined ? opt.label : `${opt.label} (${n})`}
                        onClick={() =>
                          onFiltersChange(toggleValue(filters, facet.key, opt.value))
                        }
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          on
                            ? 'bg-brand-primary text-white'
                            : 'bg-surface-hover text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {opt.label}
                        {n !== undefined && (
                          <span className="ml-1 opacity-60">{n}</span>
                        )}
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

interface ProjectFilterPillsProps {
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  members: FilterMember[];
}

export function ProjectFilterPills({
  filters,
  onFiltersChange,
  members,
}: ProjectFilterPillsProps) {
  const pills = useMemo(
    () => describeActiveProjectFilters(filters, members),
    [filters, members],
  );
  return (
    <ListPageFilterPills
      pills={pills.map((pill) => ({
        key: `${pill.key}-${pill.value}`,
        label: pill.label,
        color: pill.color,
        onRemove: () => onFiltersChange(toggleValue(filters, pill.key, pill.value)),
      }))}
      onClearAll={() => onFiltersChange({})}
    />
  );
}
