'use client';

import { useMantineColorScheme } from '@mantine/core';
import { useEffect, type PropsWithChildren } from 'react';

export function ColorSchemeProvider({ children }: PropsWithChildren) {
  const { setColorScheme } = useMantineColorScheme();
  
  useEffect(() => {
    // Get initial color scheme
    const stored = localStorage.getItem('color-scheme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialScheme = stored || (prefersDark ? 'dark' : 'light');
    
    // Set Mantine color scheme
    setColorScheme(initialScheme);
    
    // Sync with Tailwind
    const html = document.documentElement;
    if (initialScheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [setColorScheme]);
  
  return <>{children}</>;
}