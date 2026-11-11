import type { ReactNode } from 'react';
import { pillTint } from './pillTint';
import table from './DataTable.module.css';

/**
 * A read-only value in the same tinted look as PillSelect: for compact rows
 * (list views) and entities edited elsewhere, where an in-place select would
 * be noise.
 */
export function ListPageChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className={table.chip} style={pillTint(color)}>
      {children}
    </span>
  );
}
