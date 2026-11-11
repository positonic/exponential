'use client';

import { useEffect, useState } from 'react';

interface ModKey {
  /** The glyph for a visible hint: `⌘` on Apple platforms, `Ctrl` elsewhere. */
  label: string;
  /** The modifier name for `aria-keyshortcuts`: `Meta` or `Control`. */
  aria: string;
}

const APPLE: ModKey = { label: '⌘', aria: 'Meta' };
const OTHER: ModKey = { label: 'Ctrl', aria: 'Control' };

/**
 * The platform's primary modifier, for shortcut hints beside a `mod+…`
 * hotkey. Renders the Apple glyph on the server and first paint (so SSR and
 * hydration agree) and corrects itself in an effect on other platforms.
 */
export function useModKey(): ModKey {
  const [mod, setMod] = useState<ModKey>(APPLE);
  useEffect(() => {
    const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes("Mac OS X");
    if (!isApple) setMod(OTHER);
  }, []);
  return mod;
}
