import type { CSSProperties } from 'react';

// Neutral palettes whose "filled" shade has too little contrast on their own
// light tint (gray in the light theme; dark is near-invisible in the dark
// theme). Their text uses the secondary text token instead.
const NEUTRAL_COLORS = new Set<string>(['gray', 'dark']);

/**
 * The tinted look shared by the list pages' value pills: the editable
 * PillSelect and the static ListPageChip. One place, so the two can't drift.
 *
 * @param color A Mantine palette colour, e.g. `green` for Active.
 */
export function pillTint(color: string): Pick<CSSProperties, 'backgroundColor' | 'color'> {
  return {
    backgroundColor: `var(--mantine-color-${color}-light)`,
    color: NEUTRAL_COLORS.has(color)
      ? 'var(--color-text-secondary)'
      : `var(--mantine-color-${color}-filled)`,
  };
}
