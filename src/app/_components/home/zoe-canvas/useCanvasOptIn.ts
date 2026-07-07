'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const CANVAS_OPT_IN_KEY = 'zoe-canvas-opt-in';

/**
 * Sticky self-serve opt-in for the Zoe canvas experiment (ADR-0040).
 * `?canvas=1` opts the browser in (persisted to localStorage), `?canvas=0`
 * opts it out; with no param the stored value applies. Default off — opted-out
 * users keep today's drawer behaviour exactly. Deliberately not a feature
 * flag: graduation, if the experiment wins, is a real preference.
 */
export function useCanvasOptIn(): boolean {
  const searchParams = useSearchParams();
  const param = searchParams.get('canvas');
  // false until the post-mount effect reads localStorage — keeps SSR and the
  // first client render identical (the flag only ever adds behaviour).
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (param === '1') {
      localStorage.setItem(CANVAS_OPT_IN_KEY, '1');
      setEnabled(true);
    } else if (param === '0') {
      localStorage.removeItem(CANVAS_OPT_IN_KEY);
      setEnabled(false);
    } else {
      setEnabled(localStorage.getItem(CANVAS_OPT_IN_KEY) === '1');
    }
  }, [param]);

  return enabled;
}
