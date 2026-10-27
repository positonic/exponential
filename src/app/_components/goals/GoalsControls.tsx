"use client";

import { useCallback, type RefObject } from "react";
import { ActionIcon, Collapse, SegmentedControl } from "@mantine/core";
import { IconFilter, IconPlus, IconSearch } from "@tabler/icons-react";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { usePageSearchHotkey } from "~/hooks/usePageSearchHotkey";
import {
  GOALS_PAGE_PERIODS,
  type GoalsPagePeriod,
} from "~/plugins/okr/client/utils/periodUtils";
import { GoalsMineToggle } from "./GoalsMineToggle";
import type { GoalsPageView } from "./useGoalsViewParams";
import styles from "./GoalsControls.module.css";

const PERIOD_LABELS: Record<GoalsPagePeriod, string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  Annual: "Annual",
  all: "All",
};

interface GoalsControlsProps {
  period: GoalsPagePeriod;
  onPeriodChange: (period: GoalsPagePeriod) => void;
  year: string;
  /** Rendered only when more than one year is in use. */
  availableYears: string[];
  onYearChange: (year: string) => void;
  view: GoalsPageView;
  viewOptions: { value: GoalsPageView; label: string }[];
  onViewChange: (view: GoalsPageView) => void;
  onlyMine: boolean;
  onOnlyMineChange: (onlyMine: boolean) => void;
  searchRef: RefObject<HTMLInputElement>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filtersActive: boolean;
  filterRowOpen: boolean;
  onToggleFilterRow: () => void;
  /** The FilterBar, collapsed under the line until Filter is pressed. */
  filterBar: React.ReactNode;
  /** Pre-filled into the create-goal modal; `undefined` on All. */
  createDefaultPeriod: string | undefined;
  createLabel: string;
}

/**
 * The Goals page control line: every control that narrows the list, on one
 * line with one visual language — period, year, view, Mine, search ⌘F,
 * Filter and the create button. Styled like the projects toolbar.
 */
export function GoalsControls({
  period,
  onPeriodChange,
  year,
  availableYears,
  onYearChange,
  view,
  viewOptions,
  onViewChange,
  onlyMine,
  onOnlyMineChange,
  searchRef,
  searchQuery,
  onSearchChange,
  filtersActive,
  filterRowOpen,
  onToggleFilterRow,
  filterBar,
  createDefaultPeriod,
  createLabel,
}: GoalsControlsProps) {
  usePageSearchHotkey(searchRef);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") searchRef.current?.blur();
    },
    [searchRef],
  );

  return (
    <div>
      <div className={styles.line} data-testid="goals-controls">
        <SegmentedControl
          value={period}
          onChange={(value) => onPeriodChange(value as GoalsPagePeriod)}
          data={GOALS_PAGE_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          size="xs"
          aria-label="Period"
        />
        {availableYears.length > 1 && (
          <SegmentedControl
            value={year}
            onChange={onYearChange}
            data={availableYears.map((y) => ({ label: y, value: y }))}
            size="xs"
            aria-label="Year"
          />
        )}
        <SegmentedControl
          value={view}
          onChange={(value) => onViewChange(value as GoalsPageView)}
          data={viewOptions}
          size="xs"
          aria-label="View"
        />
        <GoalsMineToggle onlyMine={onlyMine} onOnlyMineChange={onOnlyMineChange} size="xs" />

        <div className={styles.spacer} />

        <div className={styles.actions}>
          <div className={styles.searchWrap}>
            <IconSearch className={styles.searchIcon} size={13} stroke={1.75} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search  ⌘F"
              aria-label="Search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={styles.searchInput}
            />
          </div>
          <button
            className={styles.actionBtn}
            type="button"
            onClick={onToggleFilterRow}
            data-active={filtersActive ? "true" : "false"}
            aria-expanded={filterRowOpen || filtersActive}
          >
            <IconFilter size={13} stroke={1.75} />
            Filter
          </button>
          <CreateGoalModal defaultPeriod={createDefaultPeriod}>
            <ActionIcon variant="subtle" size="lg" aria-label={createLabel}>
              <IconPlus size={18} />
            </ActionIcon>
          </CreateGoalModal>
        </div>
      </div>

      <Collapse in={filterRowOpen || filtersActive}>
        <div className={styles.filterRow}>{filterBar}</div>
      </Collapse>
    </div>
  );
}
