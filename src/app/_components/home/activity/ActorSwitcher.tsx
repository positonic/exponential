'use client';

/** Whose events the feed shows: everyone's, or only the viewer's own. */
export type ActivityActor = 'everyone' | 'mine';

/** Read the `?who=` param; anything but `mine` means everyone. */
export function parseActivityActor(value: string | null): ActivityActor {
  return value === 'mine' ? 'mine' : 'everyone';
}

interface ActorSwitcherProps {
  value: ActivityActor;
  onChange: (actor: ActivityActor) => void;
}

const OPTIONS: Array<{ key: ActivityActor; label: string }> = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'mine', label: 'Mine' },
];

/**
 * "Everyone / Mine" toggle for the activity feeds. "Mine" narrows the feed to
 * events the viewer performed — their own recent history — server-side, so
 * pagination stays correct. State is owned by the parent and persisted in the
 * URL as `?who=mine`.
 */
export function ActorSwitcher({ value, onChange }: ActorSwitcherProps) {
  return (
    <div
      className="wsa-projects__seg wsa-projects__seg--inline"
      role="tablist"
      aria-label="Filter by who did it"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="tab"
          aria-selected={value === opt.key}
          data-active={value === opt.key}
          className="wsa-projects__seg-btn"
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
