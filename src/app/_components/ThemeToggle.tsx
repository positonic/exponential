"use client";

import {
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { ActionIcon, Menu } from '@mantine/core';
import { IconSun, IconMoon, IconPalette } from '@tabler/icons-react';
import { getDarkTheme, setDarkTheme, type DarkThemeVariant } from '~/lib/dark-theme';

export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  // Resolve in an effect so SSR (which can't know the visitor's scheme) and
  // the first client render agree — avoids a hydration mismatch on the icon.
  const computed = useComputedColorScheme('dark', {
    getInitialValueInEffect: true,
  });

  // Mantine owns persistence (mantine-color-scheme-value) and syncs the
  // data-mantine-color-scheme attribute that both Mantine and Tailwind read.
  const handleToggle = () => {
    setColorScheme(computed === 'dark' ? 'light' : 'dark');
  };

  const handleVariant = (variant: DarkThemeVariant) => {
    setDarkTheme(variant);
  };

  const currentVariant = typeof window !== 'undefined' ? getDarkTheme() : 'navy';

  if (computed === 'dark') {
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
