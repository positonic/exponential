'use client';

/**
 * Decorative illustration for Step 2 of onboarding (Tell us about your work)
 * Shows stacked cards with charts representing work/data
 */
export function OnboardingWorkIllustration() {
  return (
    <svg
      viewBox="0 0 400 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full max-w-md mx-auto"
    >
      {/* Back card (tilted right) */}
      <g transform="translate(180, 40) rotate(12)">
        <rect
          x="0"
          y="0"
          width="160"
          height="200"
          rx="12"
          className="fill-white dark:fill-surface-tertiary"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))' }}
        />
        {/* Pie chart */}
        <circle cx="80" cy="80" r="40" className="fill-surface-secondary dark:fill-surface-primary" />
        <path
          d="M 80 40 A 40 40 0 0 1 120 80 L 80 80 Z"
          className="fill-[var(--color-onboarding-accent)]"
        />
        <path
          d="M 120 80 A 40 40 0 0 1 80 120 L 80 80 Z"
          className="fill-brand-primary opacity-60"
        />
        {/* Lines below pie */}
        <rect x="20" y="140" width="120" height="8" rx="4" className="fill-surface-secondary dark:fill-surface-primary" />
        <rect x="20" y="160" width="80" height="8" rx="4" className="fill-surface-secondary dark:fill-surface-primary" />
      </g>

      {/* Middle card (tilted left) */}
      <g transform="translate(30, 60) rotate(-8)">
        <rect
          x="0"
          y="0"
          width="160"
          height="200"
          rx="12"
          className="fill-white dark:fill-surface-tertiary"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))' }}
        />
        {/* Horizontal lines (list items) */}
        <rect x="20" y="30" width="40" height="40" rx="8" className="fill-[var(--color-onboarding-accent)] opacity-40" />
        <rect x="70" y="35" width="70" height="10" rx="5" className="fill-surface-secondary dark:fill-surface-primary" />
        <rect x="70" y="52" width="50" height="8" rx="4" className="fill-surface-tertiary dark:fill-surface-hover opacity-60" />

        <rect x="20" y="85" width="40" height="40" rx="8" className="fill-brand-primary opacity-30" />
        <rect x="70" y="90" width="70" height="10" rx="5" className="fill-surface-secondary dark:fill-surface-primary" />
        <rect x="70" y="107" width="50" height="8" rx="4" className="fill-surface-tertiary dark:fill-surface-hover opacity-60" />

        <rect x="20" y="140" width="40" height="40" rx="8" className="fill-[var(--color-onboarding-accent)] opacity-20" />
        <rect x="70" y="145" width="70" height="10" rx="5" className="fill-surface-secondary dark:fill-surface-primary" />
        <rect x="70" y="162" width="50" height="8" rx="4" className="fill-surface-tertiary dark:fill-surface-hover opacity-60" />
      </g>

      {/* Front card (main card with bar chart) */}
      <g transform="translate(100, 180)">
        <rect
          x="0"
          y="0"
          width="200"
          height="220"
          rx="16"
          className="fill-white dark:fill-surface-tertiary"
          style={{ filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))' }}
        />

        {/* Card header dots */}
        <circle cx="24" cy="24" r="6" className="fill-[var(--color-onboarding-accent)]" />
        <circle cx="44" cy="24" r="6" className="fill-brand-primary opacity-60" />
        <circle cx="64" cy="24" r="6" className="fill-surface-secondary dark:fill-surface-primary" />

        {/* Header line */}
        <rect x="90" y="18" width="90" height="12" rx="6" className="fill-surface-secondary dark:fill-surface-primary" />

        {/* Bar chart */}
        <g transform="translate(20, 60)">
          {/* Y-axis labels */}
          <rect x="0" y="10" width="20" height="6" rx="3" className="fill-text-muted opacity-40" />
          <rect x="0" y="50" width="20" height="6" rx="3" className="fill-text-muted opacity-40" />
          <rect x="0" y="90" width="20" height="6" rx="3" className="fill-text-muted opacity-40" />

          {/* Bars */}
          <rect x="35" y="60" width="25" height="70" rx="4" className="fill-[var(--color-onboarding-accent)]" />
          <rect x="70" y="30" width="25" height="100" rx="4" className="fill-brand-primary" />
          <rect x="105" y="50" width="25" height="80" rx="4" className="fill-[var(--color-onboarding-accent)] opacity-60" />
          <rect x="140" y="20" width="25" height="110" rx="4" className="fill-brand-primary opacity-70" />
        </g>

        {/* Bottom text lines */}
        <rect x="20" y="185" width="100" height="8" rx="4" className="fill-surface-secondary dark:fill-surface-primary" />
        <rect x="20" y="200" width="60" height="6" rx="3" className="fill-surface-tertiary dark:fill-surface-hover opacity-60" />
      </g>

      {/* Decorative elements */}
      <circle cx="320" cy="100" r="8" className="fill-[var(--color-onboarding-accent)] opacity-40" />
      <circle cx="60" cy="300" r="6" className="fill-brand-primary opacity-30" />
      <circle cx="350" cy="350" r="10" className="fill-[var(--color-onboarding-accent)] opacity-30" />

      {/* Small floating dots */}
      <circle cx="280" cy="180" r="4" className="fill-brand-primary opacity-40" />
      <circle cx="50" cy="150" r="5" className="fill-[var(--color-onboarding-accent)] opacity-50" />
    </svg>
  );
}
