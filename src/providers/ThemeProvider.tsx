'use client';

import { createContext, useContext, type PropsWithChildren } from 'react';
import { themes, type ValidDomain, type ThemeConfig } from '~/config/themes';

const ThemeContext = createContext<ThemeConfig>(themes['forceflow.com']);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({
  children,
  domain,
}: PropsWithChildren<{
  domain: ValidDomain;
}>) {
  const theme = themes[domain] ?? themes['forceflow.com']; // fallback to default theme

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
} 