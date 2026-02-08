'use client';

import { useMantineColorScheme } from '@mantine/core';
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  SegmentedControl,
  Group,
} from '@mantine/core';
import { IconSun, IconMoon, IconDeviceDesktop } from '@tabler/icons-react';

export default function AppearanceSettingsPage() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const handleChange = (value: string) => {
    const scheme = value as 'light' | 'dark' | 'auto';
    setColorScheme(scheme);

    // Sync with Tailwind
    const html = document.documentElement;
    if (scheme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
    } else if (scheme === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
    } else {
      // auto - follow system preference
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      if (prefersDark) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }

    localStorage.setItem('color-scheme', scheme);
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2} className="text-text-primary">
            Appearance
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Customize how the application looks
          </Text>
        </div>

        {/* Color Mode */}
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Text fw={500} className="text-text-primary mb-1">
            Color mode
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Choose between light and dark themes, or follow your system setting
          </Text>

          <SegmentedControl
            value={colorScheme}
            onChange={handleChange}
            data={[
              {
                value: 'light',
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconSun size={16} />
                    <span>Light</span>
                  </Group>
                ),
              },
              {
                value: 'dark',
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconMoon size={16} />
                    <span>Dark</span>
                  </Group>
                ),
              },
              {
                value: 'auto',
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconDeviceDesktop size={16} />
                    <span>System</span>
                  </Group>
                ),
              },
            ]}
            fullWidth
          />
        </Paper>
      </Stack>
    </Container>
  );
}
