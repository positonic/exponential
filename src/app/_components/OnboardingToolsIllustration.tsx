'use client';

/**
 * Decorative illustration for Step 3 of onboarding (Tools selection)
 * Shows puzzle pieces with one piece fitting in
 */
export function OnboardingToolsIllustration() {
  return (
    <svg
      viewBox="0 0 400 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full max-w-md mx-auto"
    >
      {/* Background puzzle grid - 2x2 layout */}
      <g transform="translate(80, 100)">
        {/* Top-left puzzle piece (outline) */}
        <path
          d="M 0 50
             L 0 10
             Q 0 0 10 0
             L 50 0
             Q 60 0 60 10
             L 60 35
             C 60 35 70 30 80 35
             C 90 40 90 60 80 65
             C 70 70 60 65 60 65
             L 60 90
             Q 60 100 50 100
             L 35 100
             C 35 100 40 110 35 120
             C 30 130 10 130 5 120
             C 0 110 5 100 5 100
             L 10 100
             Q 0 100 0 90
             L 0 50
             Z"
          className="fill-[var(--color-onboarding-illustration-bg)] stroke-[var(--color-onboarding-accent)]"
          strokeWidth="2"
          strokeOpacity="0.4"
        />

        {/* Top-right puzzle piece (outline) */}
        <g transform="translate(100, 0)">
          <path
            d="M 0 35
               C 0 35 -10 30 -20 35
               C -30 40 -30 60 -20 65
               C -10 70 0 65 0 65
               L 0 10
               Q 0 0 10 0
               L 90 0
               Q 100 0 100 10
               L 100 90
               Q 100 100 90 100
               L 35 100
               C 35 100 40 110 35 120
               C 30 130 10 130 5 120
               C 0 110 5 100 5 100
               L 10 100
               Q 0 100 0 90
               L 0 35
               Z"
            className="fill-[var(--color-onboarding-illustration-bg)] stroke-[var(--color-onboarding-accent)]"
            strokeWidth="2"
            strokeOpacity="0.4"
          />
        </g>

        {/* Bottom-left puzzle piece (outline) */}
        <g transform="translate(0, 140)">
          <path
            d="M 5 0
               C 5 0 0 -10 5 -20
               C 10 -30 30 -30 35 -20
               C 40 -10 35 0 35 0
               L 50 0
               Q 60 0 60 10
               L 60 35
               C 60 35 70 30 80 35
               C 90 40 90 60 80 65
               C 70 70 60 65 60 65
               L 60 90
               Q 60 100 50 100
               L 10 100
               Q 0 100 0 90
               L 0 10
               Q 0 0 10 0
               L 5 0
               Z"
            className="fill-[var(--color-onboarding-illustration-bg)] stroke-[var(--color-onboarding-accent)]"
            strokeWidth="2"
            strokeOpacity="0.4"
          />
        </g>

        {/* Bottom-right puzzle piece (SOLID - the one fitting in) */}
        <g transform="translate(100, 140)">
          <path
            d="M 5 0
               C 5 0 0 -10 5 -20
               C 10 -30 30 -30 35 -20
               C 40 -10 35 0 35 0
               L 90 0
               Q 100 0 100 10
               L 100 90
               Q 100 100 90 100
               L 10 100
               Q 0 100 0 90
               L 0 35
               C 0 35 -10 30 -20 35
               C -30 40 -30 60 -20 65
               C -10 70 0 65 0 65
               L 0 10
               Q 0 0 10 0
               L 5 0
               Z"
            className="fill-[var(--color-onboarding-accent)]"
            style={{ filter: 'drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.15))' }}
          />

          {/* Highlight on solid piece */}
          <path
            d="M 15 15 L 60 15 L 60 20 L 15 20 Z"
            className="fill-white opacity-30"
            rx="2"
          />
        </g>

        {/* Motion lines indicating piece is connecting */}
        <g transform="translate(210, 160)" className="opacity-50">
          <line x1="0" y1="0" x2="15" y2="-5" className="stroke-[var(--color-onboarding-accent)]" strokeWidth="2" strokeLinecap="round" />
          <line x1="0" y1="10" x2="20" y2="10" className="stroke-[var(--color-onboarding-accent)]" strokeWidth="2" strokeLinecap="round" />
          <line x1="0" y1="20" x2="15" y2="25" className="stroke-[var(--color-onboarding-accent)]" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>

      {/* Decorative elements */}
      <circle cx="60" cy="120" r="8" className="fill-[var(--color-onboarding-accent)] opacity-30" />
      <circle cx="340" cy="100" r="6" className="fill-[var(--color-onboarding-accent)] opacity-40" />
      <circle cx="320" cy="380" r="10" className="fill-[var(--color-onboarding-accent)] opacity-25" />
      <circle cx="80" cy="350" r="5" className="fill-[var(--color-onboarding-accent)] opacity-35" />

      {/* Small dots */}
      <circle cx="100" cy="80" r="3" className="fill-[var(--color-onboarding-accent)] opacity-50" />
      <circle cx="300" cy="140" r="4" className="fill-[var(--color-onboarding-accent)] opacity-40" />
    </svg>
  );
}
