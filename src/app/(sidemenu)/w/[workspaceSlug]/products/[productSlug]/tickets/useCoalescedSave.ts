import { useCallback, useEffect, useRef } from "react";

/**
 * Debounce a partial-object save so successive calls inside the window are
 * MERGED, not replaced.
 *
 * The tickets page persists view prefs one key at a time - `{ filters }` from
 * the filter popover, `{ view }` from the segmented control, `{ sortField }`
 * from a column header - through one shared debounce. A plain last-call-wins
 * debounce drops every payload but the final one, and the UI makes that a
 * common path: the popover closes on the same click that switches the view,
 * so "toggle a filter, click Board" lands two saves inside 500ms and only
 * `{ view }` reached the server. The next reload then restored the pre-toggle
 * filters - the "my filters vanished when I switched view" bug.
 *
 * Pending changes also flush on unmount, so navigating away inside the window
 * doesn't lose them.
 */
export function useCoalescedSave<T extends object>(
  save: (patch: Partial<T>) => void,
  delayMs = 500,
): { push: (patch: Partial<T>) => void; flush: () => void } {
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    saveRef.current(patch);
  }, []);

  const push = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  useEffect(() => flush, [flush]);

  return { push, flush };
}
