'use client';

import { useEffect } from 'react';
import { PRODUCT_NAME } from '~/lib/brand';

/**
 * Sets the browser-tab title to `"<title> | <product name>"` while mounted, for
 * client pages that can't export `metadata`. Pass `null` while there is
 * nothing to name yet; the tab keeps whatever title it had.
 *
 * Restores the previous title on unmount or change, so leaving the page drops
 * back to the app's default rather than leaving a stale name behind. Keep the
 * " | " separator: RecentsNav strips everything after it to read a name.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} | ${PRODUCT_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
