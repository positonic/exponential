"use client";

import { useMantineColorScheme } from '@mantine/core';
import { ActionIcon } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  
  const handleToggle = () => {
    const newScheme = colorScheme === 'dark' ? 'light' : 'dark';
    
    // Toggle Mantine color scheme
    toggleColorScheme();
    
    // Sync with Tailwind
    const html = document.documentElement;
    if (newScheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    
    // Store preference
    localStorage.setItem('color-scheme', newScheme);
  };
  
  return (
    <ActionIcon
      onClick={handleToggle}
      variant="subtle"
      size="lg"
      radius="md"
      aria-label={colorScheme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
    >
      {colorScheme === 'dark' ? (
        <IconSun size={20} />
      ) : (
        <IconMoon size={20} />
      )}
    </ActionIcon>
  );
} 