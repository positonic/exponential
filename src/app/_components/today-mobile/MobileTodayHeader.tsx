"use client";

import { Text } from "@mantine/core";
import type { DoFilter } from "../DoPageContent";
import { ScoreGauge } from "./ScoreGauge";
import { WeekStrip } from "./WeekStrip";
import { FilterPills } from "./FilterPills";
import styles from "./MobileToday.module.css";

interface MobileTodayHeaderProps {
  filter: DoFilter;
  onFilterChange: (f: DoFilter) => void;
  taskCount: number;
  score?: { totalScore: number } | null;
  scoreColor: string;
  onScoreClick: () => void;
  tagOptions: { value: string; label: string }[];
  selectedTagIds: string[];
  onTagSelect: (ids: string[]) => void;
}

export function MobileTodayHeader({
  filter,
  onFilterChange,
  taskCount,
  score,
  scoreColor,
  onScoreClick,
  tagOptions,
  selectedTagIds,
  onTagSelect,
}: MobileTodayHeaderProps) {
  const today = new Date();
  const subtitle = `${today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${taskCount} task${taskCount === 1 ? "" : "s"}`;

  return (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{titleFor(filter)}</h1>
          <Text component="div" className={styles.subtitle}>
            {subtitle}
          </Text>
        </div>
        {score && (
          <ScoreGauge
            value={score.totalScore}
            color={scoreColor}
            onClick={onScoreClick}
          />
        )}
      </div>
      <WeekStrip filter={filter} onFilterChange={onFilterChange} />
      {tagOptions.length > 0 && (
        <FilterPills
          options={tagOptions}
          selected={selectedTagIds}
          onChange={onTagSelect}
        />
      )}
    </div>
  );
}

function titleFor(f: DoFilter): string {
  if (f === "tomorrow") return "Tomorrow";
  if (f === "upcoming") return "Upcoming";
  return "Today";
}
