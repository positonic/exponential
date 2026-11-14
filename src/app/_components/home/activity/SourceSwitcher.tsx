'use client';

import { providerIcon, providerLabel } from './activityRow';

interface SourceSwitcherProps {
  /** Current source: `all` | `internal` | a provider string. */
  value: string;
  onChange: (source: string) => void;
  /** Whether the workspace has any non-channel (Exponential) events. */
  hasInternal: boolean;
  /** Distinct channel providers present (e.g. `["whatsapp"]`). */
  providers: string[];
}

/**
 * Activity-source segmented control (ADR-0023). Grows one chip per provider
 * present, derived read-side from `metadata.provider`, so adding Slack later
 * needs no redesign. Hidden when there is nothing to filter (no provider
 * sources beyond the default Exponential stream) and no filter is active.
 * State is owned by the parent and persisted in the URL as `?source=`.
 */
export function SourceSwitcher({
  value,
  onChange,
  hasInternal,
  providers,
}: SourceSwitcherProps) {
  // Nothing to filter — don't show a one-option control. While a filter is
  // active the control stays, even if the filtered rows name no provider:
  // hiding it would leave no way back to "All" (e.g. `?source=internal`, whose
  // rows are all internal by definition).
  if (providers.length === 0 && value === 'all') return null;

  const options: Array<{ key: string; label: string; provider?: string }> = [
    { key: 'all', label: 'All' },
    ...(hasInternal || value === 'internal'
      ? [{ key: 'internal', label: 'Exponential' }]
      : []),
    ...providers.map((p) => ({ key: p, label: providerLabel(p), provider: p })),
  ];

  return (
    <div className="wsa-projects__seg" role="tablist" aria-label="Filter by source">
      {options.map((opt) => {
        const Icon = opt.provider ? providerIcon(opt.provider) : null;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={value === opt.key}
            data-active={value === opt.key}
            className="wsa-projects__seg-btn"
            onClick={() => onChange(opt.key)}
          >
            {Icon ? <Icon size={13} stroke={1.8} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
