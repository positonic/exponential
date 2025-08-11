'use client';

import { createContext, useContext, type PropsWithChildren } from 'react';
import { themes, type ValidDomain, type ThemeConfig } from '~/config/themes';

interface ThemeContextValue {
  theme: ThemeConfig;
  domain: ValidDomain;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes['forceflow.com'],
  domain: 'forceflow.com',
});

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
  
  const value: ThemeContextValue = {
    theme,
    domain,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
} 