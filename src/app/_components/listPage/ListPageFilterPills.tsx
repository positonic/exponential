'use client';

import { ActionIcon, Badge, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import styles from './ListPage.module.css';

export interface ListPageFilterPill {
  /** Unique within the row, e.g. `${facet}-${value}`. */
  key: string;
  label: string;
  /** Mantine palette colour. */
  color: string;
  onRemove: () => void;
}

/**
 * One dismissable pill per applied filter value, for the top bar's left
 * cluster. With more than one pill a "clear all" × follows them.
 */
export function ListPageFilterPills({
  pills,
  onClearAll,
}: {
  pills: ListPageFilterPill[];
  onClearAll: () => void;
}) {
  if (pills.length === 0) return null;

  return (
    <div className={styles.pills} role="list" aria-label="Active filters">
      {pills.map((pill) => (
        <Badge
          key={pill.key}
          role="listitem"
          variant="light"
          color={pill.color}
          rightSection={
            <ActionIcon
              variant="transparent"
              size="xs"
              color="gray"
              aria-label={`Remove ${pill.label} filter`}
              onClick={pill.onRemove}
            >
              <IconX size={11} />
            </ActionIcon>
          }
        >
          {pill.label}
        </Badge>
      ))}
      {pills.length > 1 && (
        <Tooltip label="Clear all filters" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Clear all filters"
            onClick={onClearAll}
          >
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}
