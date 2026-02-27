"use client";

import { useMantineColorScheme } from '@mantine/core';
import { ActionIcon, Menu } from '@mantine/core';
import { IconSun, IconMoon, IconPalette } from '@tabler/icons-react';
import { getDarkTheme, setDarkTheme, type DarkThemeVariant } from '~/lib/dark-theme';

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

  const handleVariant = (variant: DarkThemeVariant) => {
    setDarkTheme(variant);
  };

  const currentVariant = typeof window !== 'undefined' ? getDarkTheme() : 'navy';

  if (colorScheme === 'dark') {
    return (
      <Menu shadow="md" width={160} position="bottom-end">
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size="lg"
            radius="md"
            aria-label="Theme options"
          >
            <IconSun size={20} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown className="bg-surface-secondary border-border-primary">
          <Menu.Item
            leftSection={<IconSun size={16} />}
            onClick={handleToggle}
            className="text-text-primary hover:bg-surface-hover"
          >
            Light mode
          </Menu.Item>
          <Menu.Divider className="border-border-primary" />
          <Menu.Label className="text-text-muted">Dark style</Menu.Label>
          <Menu.Item
            leftSection={<IconPalette size={16} />}
            onClick={() => handleVariant('navy')}
            className="text-text-primary hover:bg-surface-hover"
            rightSection={currentVariant === 'navy' ? <span className="text-brand-primary text-xs">●</span> : null}
          >
            Navy
          </Menu.Item>
          <Menu.Item
            leftSection={<IconPalette size={16} />}
            onClick={() => handleVariant('slate')}
            className="text-text-primary hover:bg-surface-hover"
            rightSection={currentVariant === 'slate' ? <span className="text-brand-primary text-xs">●</span> : null}
          >
            Slate
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <ActionIcon
      onClick={handleToggle}
      variant="subtle"
      size="lg"
      radius="md"
      aria-label="Switch to dark mode"
    >
      <IconMoon size={20} />
    </ActionIcon>
  );
}
