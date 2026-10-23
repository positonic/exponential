'use client';

import { createContext, useContext } from 'react';

/**
 * How the desktop sidebar is showing: `full` (220px, labels) or `rail`
 * (icons only). Mobile only ever shows it full, over a backdrop.
 */
export type SidebarMode = 'full' | 'rail';

const SidebarModeContext = createContext<SidebarMode>('full');

export const SidebarModeProvider = SidebarModeContext.Provider;

export function useSidebarMode(): SidebarMode {
  return useContext(SidebarModeContext);
}
