'use client';

/**
 * Decorative illustration for Step 4 of onboarding (Create Project)
 * Shows a task list mockup window with AI sparkle icon
 */
export function OnboardingProjectIllustration() {
  return (
    <svg
      viewBox="0 0 400 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full max-w-md mx-auto"
    >
      {/* Main window card */}
      <g transform="translate(60, 60)">
        {/* Window shadow */}
        <rect
          x="8"
          y="8"
          width="280"
          height="320"
          rx="16"
          className="fill-black opacity-10"
        />

        {/* Window background */}
        <rect
          x="0"
          y="0"
          width="280"
          height="320"
          rx="16"
          className="fill-white dark:fill-surface-tertiary"
        />

        {/* Window header bar */}
        <rect
          x="0"
          y="0"
          width="280"
          height="44"
          rx="16"
          className="fill-surface-secondary dark:fill-surface-primary"
        />
        {/* Bottom corners of header (squared off) */}
        <rect
          x="0"
          y="28"
          width="280"
          height="16"
          className="fill-surface-secondary dark:fill-surface-primary"
        />

        {/* Traffic light dots */}
        <circle cx="24" cy="22" r="6" className="fill-[var(--color-macos-close)]" />
        <circle cx="44" cy="22" r="6" className="fill-[var(--color-macos-minimize)]" />
        <circle cx="64" cy="22" r="6" className="fill-[var(--color-macos-maximize)]" />

        {/* AI Sparkle icon */}
        <g transform="translate(230, 12)">
          <path
            d="M10 0 L12 7 L19 10 L12 13 L10 20 L8 13 L1 10 L8 7 Z"
            className="fill-[var(--color-onboarding-accent)]"
          />
          <circle cx="18" cy="3" r="2" className="fill-[var(--color-onboarding-accent)] opacity-60" />
          <circle cx="3" cy="18" r="1.5" className="fill-[var(--color-onboarding-accent)] opacity-40" />
        </g>

        {/* Section 1 - Collapsed */}
        <g transform="translate(16, 60)">
          {/* Dropdown arrow (right facing = collapsed) */}
          <path
            d="M8 6 L14 12 L8 18"
            className="stroke-text-muted"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Section title */}
          <rect x="24" y="8" width="100" height="10" rx="5" className="fill-surface-secondary dark:fill-surface-primary" />
          {/* Badge */}
          <rect x="130" y="8" width="24" height="10" rx="5" className="fill-[var(--color-onboarding-accent)] opacity-30" />
        </g>

        {/* Section 2 - Expanded */}
        <g transform="translate(16, 100)">
          {/* Dropdown arrow (down facing = expanded) */}
          <path
            d="M6 8 L12 14 L18 8"
            className="stroke-[var(--color-onboarding-accent)]"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Section title */}
          <rect x="24" y="6" width="120" height="10" rx="5" className="fill-[var(--color-onboarding-accent)] opacity-40" />

          {/* Task items */}
          {/* Task 1 - completed */}
          <g transform="translate(24, 28)">
            <circle cx="10" cy="10" r="9" className="stroke-[var(--color-onboarding-accent)] fill-[var(--color-onboarding-accent)]" strokeWidth="2" />
            <path
              d="M6 10 L9 13 L14 7"
              className="stroke-white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <rect x="28" y="5" width="140" height="8" rx="4" className="fill-surface-secondary dark:fill-surface-primary" />
          </g>

          {/* Task 2 - incomplete */}
          <g transform="translate(24, 54)">
            <circle cx="10" cy="10" r="9" className="stroke-surface-tertiary dark:stroke-surface-hover" strokeWidth="2" fill="none" />
            <rect x="28" y="5" width="120" height="8" rx="4" className="fill-surface-secondary dark:fill-surface-primary" />
          </g>

          {/* Task 3 - incomplete */}
          <g transform="translate(24, 80)">
            <circle cx="10" cy="10" r="9" className="stroke-surface-tertiary dark:stroke-surface-hover" strokeWidth="2" fill="none" />
            <rect x="28" y="5" width="100" height="8" rx="4" className="fill-surface-secondary dark:fill-surface-primary" />
          </g>
        </g>

        {/* Section 3 - Collapsed */}
        <g transform="translate(16, 220)">
          {/* Dropdown arrow (right facing = collapsed) */}
          <path
            d="M8 6 L14 12 L8 18"
            className="stroke-text-muted"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Section title */}
          <rect x="24" y="8" width="80" height="10" rx="5" className="fill-surface-secondary dark:fill-surface-primary" />
          {/* Badge */}
          <rect x="110" y="8" width="24" height="10" rx="5" className="fill-brand-primary opacity-30" />
        </g>

        {/* Section 4 - Collapsed */}
        <g transform="translate(16, 256)">
          {/* Dropdown arrow (right facing = collapsed) */}
          <path
            d="M8 6 L14 12 L8 18"
            className="stroke-text-muted"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Section title */}
          <rect x="24" y="8" width="110" height="10" rx="5" className="fill-surface-secondary dark:fill-surface-primary" />
        </g>

        {/* Add button hint at bottom */}
        <g transform="translate(16, 292)">
          <circle cx="12" cy="12" r="10" className="stroke-surface-tertiary dark:stroke-surface-hover stroke-dashed" strokeWidth="1.5" strokeDasharray="4 2" fill="none" />
          <line x1="7" y1="12" x2="17" y2="12" className="stroke-text-muted" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="7" x2="12" y2="17" className="stroke-text-muted" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="28" y="7" width="60" height="8" rx="4" className="fill-surface-tertiary dark:fill-surface-hover opacity-50" />
        </g>
      </g>

      {/* Decorative elements */}
      <circle cx="50" cy="100" r="8" className="fill-[var(--color-onboarding-accent)] opacity-30" />
      <circle cx="370" cy="80" r="6" className="fill-brand-primary opacity-40" />
      <circle cx="380" cy="360" r="10" className="fill-[var(--color-onboarding-accent)] opacity-25" />
      <circle cx="40" cy="380" r="5" className="fill-brand-primary opacity-35" />

      {/* Small floating dots */}
      <circle cx="360" cy="150" r="4" className="fill-[var(--color-onboarding-accent)] opacity-50" />
      <circle cx="30" cy="200" r="3" className="fill-brand-primary opacity-40" />

      {/* Sparkle decorations */}
      <g transform="translate(355, 280)" className="opacity-40">
        <path
          d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z"
          className="fill-[var(--color-onboarding-accent)]"
        />
      </g>
      <g transform="translate(25, 320)" className="opacity-30">
        <path
          d="M4 0 L5 3 L8 4 L5 5 L4 8 L3 5 L0 4 L3 3 Z"
          className="fill-brand-primary"
        />
      </g>
    </svg>
  );
}
