'use client';

import { type PropsWithChildren } from "react";
import { useTheme } from '~/providers/ThemeProvider';

export function ThemeWrapper({ children }: PropsWithChildren) {
  const { theme } = useTheme();

  return (
    <div className={`min-h-screen ${theme.colors.background.main} ${theme.colors.text.primary}`}>
      <div className="flex">
        {children}
      </div>
    </div>
  );
} 

/**
 * Renders the route's children through a component fiber instead of placing
 * them directly inside `<main>`.
 *
 * On a hard load the router element for the page can still be waiting on a
 * JS chunk when hydration reaches `<main>`. If a host element (`<main>`) is
 * the one that suspends and the chunk lands quickly, React replays that host
 * element with its hydration cursor already inside it and throws React error
 * 418, client-rendering the whole page. Suspending in this component instead is
 * replayed safely: it claims no DOM node.
 *
 * Lives in this module on purpose: ThemeWrapper is `<main>`'s ancestor, so the
 * module is always loaded by the time this element is reached and the element
 * itself can't be a pending lazy.
 */
export function RouteChildren({ children }: PropsWithChildren) {
  return <>{children}</>;
}
