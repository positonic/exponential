'use client';

import { createContext, useContext, ReactNode } from 'react';
import { type ThemeConfig, themes } from '~/config/themes';

const ThemeContext = createContext<ThemeConfig | null>(null);

export function ThemeProvider({ 
  children,
  domain 
}: { 
  children: ReactNode;
  domain: string;
}) {
  const theme = themes[domain] ?? themes['forceflow.com']; // fallback to default theme

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within ThemeProvider');
  return theme;
} 