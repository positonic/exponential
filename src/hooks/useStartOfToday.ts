'use client';

import { useState } from 'react';

/**
 * The viewer's local midnight, fixed for the component's lifetime so it can
 * sit in a tRPC input without changing the query key on every render. Pass
 * it to procedures that need the viewer's day boundary (e.g. "overdue").
 */
export function useStartOfToday(): Date {
  const [startOfToday] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  return startOfToday;
}
