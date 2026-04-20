"use client";

import { Tabs, Text } from "@mantine/core";
import { clamp01 } from "../utils/okrDashboardUtils";

interface PeriodTabsProps {
  selectedPeriod: "Annual" | "Q1" | "Q2" | "Q3" | "Q4";
  onPeriodChange: (period: "Annual" | "Q1" | "Q2" | "Q3" | "Q4") => void;
  counts?: Record<
    string,
    { objectives: number; keyResults: number; averageProgress: number }
  >;
  isLoading?: boolean;
}

/**
 * Compact circular progress ring rendered as inline SVG.
 * `size` is diameter in px. `color` is any CSS color string.
 */
function Ring({
  value,
  size = 18,
  color,
  track = "var(--color-surface-tertiary)",
  stroke = 2.4,
}: {
  value: number; // 0..1
  size?: number;
  color: string;
  track?: string;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamp01(value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={track}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function PeriodTabs({
  selectedPeriod,
  onPeriodChange,
  counts,
  isLoading,
}: PeriodTabsProps) {
  const periods: Array<{
    value: "Annual" | "Q1" | "Q2" | "Q3" | "Q4";
    label: string;
  }> = [
    { value: "Q1", label: "Q1" },
    { value: "Q2", label: "Q2" },
    { value: "Q3", label: "Q3" },
    { value: "Q4", label: "Q4" },
    { value: "Annual", label: "Annual" },
  ];

  return (
    <Tabs
      value={selectedPeriod}
      onChange={(value) => {
        if (value) {
          onPeriodChange(value as "Annual" | "Q1" | "Q2" | "Q3" | "Q4");
        }
      }}
      variant="default"
      radius="md"
      styles={{
        list: { borderBottom: "1px solid var(--color-border-primary)", gap: 8 },
        tab: { color: "var(--color-text-secondary)", padding: "10px 14px" },
      }}
    >
      <Tabs.List>
        {periods.map((period) => {
          const progressPct = counts?.[period.value]?.averageProgress ?? 0;
          const active = selectedPeriod === period.value;
          const ringColor = active
            ? "var(--color-brand-primary)"
            : "var(--color-text-muted)";

          return (
            <Tabs.Tab
              key={period.value}
              value={period.value}
              aria-label={`${period.label} period, ${progressPct}% progress`}
            >
              <span className="inline-flex items-center gap-2">
                <Ring value={progressPct / 100} color={ringColor} />
                <Text
                  size="sm"
                  fw={active ? 600 : 500}
                  className={active ? "text-text-primary" : "text-text-secondary"}
                >
                  {period.label}
                </Text>
                {!isLoading && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
                    style={{
                      background: active
                        ? "var(--mantine-color-brand-light)"
                        : "var(--color-surface-tertiary)",
                      color: active
                        ? "var(--color-brand-primary)"
                        : "var(--color-text-muted)",
                    }}
                  >
                    {progressPct}%
                  </span>
                )}
              </span>
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}
