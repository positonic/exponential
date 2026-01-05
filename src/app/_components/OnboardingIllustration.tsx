'use client';

/**
 * Decorative illustration for the onboarding page
 * Inspired by Asana's welcoming illustration style
 */
export function OnboardingIllustration() {
  return (
    <svg
      viewBox="0 0 400 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full max-w-md mx-auto"
    >
      {/* Cloud left */}
      <ellipse cx="80" cy="180" rx="40" ry="25" className="fill-white dark:fill-surface-tertiary" />
      <ellipse cx="60" cy="190" rx="25" ry="18" className="fill-white dark:fill-surface-tertiary" />
      <ellipse cx="100" cy="190" rx="30" ry="20" className="fill-white dark:fill-surface-tertiary" />

      {/* Cloud right */}
      <ellipse cx="320" cy="220" rx="35" ry="22" className="fill-white dark:fill-surface-tertiary" />
      <ellipse cx="340" cy="230" rx="25" ry="16" className="fill-white dark:fill-surface-tertiary" />
      <ellipse cx="300" cy="228" rx="28" ry="18" className="fill-white dark:fill-surface-tertiary" />

      {/* Small cloud top */}
      <ellipse cx="280" cy="120" rx="20" ry="12" className="fill-white dark:fill-surface-tertiary" />
      <ellipse cx="295" cy="125" rx="15" ry="10" className="fill-white dark:fill-surface-tertiary" />

      {/* Chat bubble left */}
      <g transform="translate(60, 280)">
        <rect x="0" y="0" width="50" height="35" rx="8" className="fill-white dark:fill-surface-tertiary" />
        <polygon points="15,35 25,45 30,35" className="fill-white dark:fill-surface-tertiary" />
        {/* Dots inside */}
        <circle cx="15" cy="17" r="3" className="fill-text-muted" />
        <circle cx="25" cy="17" r="3" className="fill-text-muted" />
        <circle cx="35" cy="17" r="3" className="fill-text-muted" />
      </g>

      {/* Email/envelope icon */}
      <g transform="translate(240, 140)">
        <rect x="0" y="0" width="60" height="45" rx="6" className="fill-white dark:fill-surface-tertiary stroke-border-primary" strokeWidth="2" />
        <polyline points="0,5 30,28 60,5" className="stroke-text-muted" strokeWidth="2" fill="none" />
        {/* Notification dot */}
        <circle cx="55" cy="5" r="8" className="fill-[var(--color-onboarding-accent)]" />
      </g>

      {/* Phone/device */}
      <g transform="translate(280, 200)">
        <rect x="0" y="0" width="45" height="80" rx="8" className="fill-white dark:fill-surface-tertiary stroke-border-primary" strokeWidth="2" />
        {/* Screen */}
        <rect x="5" y="12" width="35" height="50" rx="2" className="fill-surface-secondary dark:fill-surface-primary" />
        {/* Home button indicator */}
        <rect x="15" y="68" width="15" height="4" rx="2" className="fill-border-primary" />
        {/* Screen content lines */}
        <rect x="10" y="20" width="25" height="3" rx="1" className="fill-text-muted opacity-50" />
        <rect x="10" y="28" width="20" height="3" rx="1" className="fill-text-muted opacity-30" />
        <rect x="10" y="36" width="22" height="3" rx="1" className="fill-text-muted opacity-30" />
      </g>

      {/* Lightbulb */}
      <g transform="translate(170, 100)">
        <ellipse cx="20" cy="25" rx="18" ry="22" className="fill-amber-100 dark:fill-amber-900/30 stroke-amber-400" strokeWidth="2" />
        <rect x="12" y="45" width="16" height="8" rx="2" className="fill-amber-200 dark:fill-amber-800/40" />
        <rect x="14" y="52" width="12" height="3" rx="1" className="fill-amber-300 dark:fill-amber-700/50" />
        {/* Light rays */}
        <line x1="20" y1="0" x2="20" y2="-10" className="stroke-amber-400" strokeWidth="2" strokeLinecap="round" />
        <line x1="40" y1="15" x2="48" y2="10" className="stroke-amber-400" strokeWidth="2" strokeLinecap="round" />
        <line x1="0" y1="15" x2="-8" y2="10" className="stroke-amber-400" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Chat bubble right */}
      <g transform="translate(310, 310)">
        <rect x="0" y="0" width="45" height="30" rx="6" className="fill-white dark:fill-surface-tertiary" />
        <polygon points="30,30 35,38 40,30" className="fill-white dark:fill-surface-tertiary" />
        {/* Lines inside */}
        <rect x="8" y="10" width="30" height="3" rx="1" className="fill-text-muted opacity-50" />
        <rect x="8" y="17" width="20" height="3" rx="1" className="fill-text-muted opacity-30" />
      </g>

      {/* Bar chart icon */}
      <g transform="translate(120, 300)">
        <rect x="0" y="20" width="10" height="30" rx="2" className="fill-brand-primary opacity-60" />
        <rect x="15" y="10" width="10" height="40" rx="2" className="fill-brand-primary opacity-80" />
        <rect x="30" y="0" width="10" height="50" rx="2" className="fill-brand-primary" />
      </g>

      {/* Abstract sunrise/hill shape at bottom */}
      <ellipse
        cx="200"
        cy="520"
        rx="180"
        ry="100"
        className="fill-[var(--color-onboarding-accent)] opacity-80"
      />

      {/* Smaller accent shape */}
      <ellipse
        cx="200"
        cy="480"
        rx="120"
        ry="40"
        className="fill-[var(--color-onboarding-accent)] opacity-40"
      />

      {/* Decorative dots */}
      <circle cx="150" cy="160" r="4" className="fill-brand-primary opacity-40" />
      <circle cx="250" cy="280" r="3" className="fill-brand-primary opacity-30" />
      <circle cx="100" cy="350" r="5" className="fill-[var(--color-onboarding-accent)] opacity-50" />
      <circle cx="350" cy="160" r="4" className="fill-brand-primary opacity-40" />
    </svg>
  );
}
