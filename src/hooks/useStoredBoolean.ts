'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A boolean remembered per device in localStorage — a folded disclosure, the
 * collapsed rail. Renders `initial` on the server and the first client paint,
 * then reads storage in an effect, so SSR and hydration always agree.
 * Storage that is absent or throwing just means the value does not persist.
 */
export function useStoredBoolean(
  key: string,
  initial: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === 'true' || raw === 'false') setValue(raw === 'true');
    } catch {
      // Unavailable storage: keep the initial value.
    }
  }, [key]);

  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          window.localStorage.setItem(key, String(resolved));
        } catch {
          // Unavailable storage: the value lives for this mount only.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
