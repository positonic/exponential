"use client";

import styles from "./MobileToday.module.css";

interface ScoreGaugeProps {
  value: number;
  color: string;
  onClick?: () => void;
}

export function ScoreGauge({ value, color, onClick }: ScoreGaugeProps) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const dashOffset = circumference * (1 - pct);

  return (
    <button
      type="button"
      className={styles.gaugeBtn}
      onClick={onClick}
      aria-label="Daily score breakdown"
    >
      <svg viewBox="0 0 80 80" className={styles.gauge} aria-hidden>
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth="6"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className={styles.gaugeLabel}>
        <span className={styles.gaugeValue}>{value}</span>
        <span className={styles.gaugeMax}>/100</span>
      </div>
    </button>
  );
}
