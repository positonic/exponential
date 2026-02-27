'use client';

import { useMantineColorScheme } from '@mantine/core';
import { useEffect, type PropsWithChildren } from 'react';
import { getDarkTheme, setDarkTheme } from '~/lib/dark-theme';

export function ColorSchemeProvider({ children }: PropsWithChildren) {
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    // Get initial color scheme
    const stored = localStorage.getItem('color-scheme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialScheme = stored ?? (prefersDark ? 'dark' : 'light');

    // Set Mantine color scheme
    setColorScheme(initialScheme);

    // Sync with Tailwind
    const html = document.documentElement;
    if (initialScheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }

    // Sync dark theme variant
    setDarkTheme(getDarkTheme());
  }, [setColorScheme]);

  return <>{children}</>;
}