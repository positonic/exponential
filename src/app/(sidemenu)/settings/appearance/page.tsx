'use client';

import { useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  SegmentedControl,
  Group,
  Box,
} from '@mantine/core';
import { IconSun, IconMoon, IconDeviceDesktop } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import {
  getDarkTheme,
  setDarkTheme,
  type DarkThemeVariant,
} from '~/lib/dark-theme';

export default function AppearanceSettingsPage() {
  // Mantine owns persistence (mantine-color-scheme-value) and syncs the
  // data-mantine-color-scheme attribute that both Mantine and Tailwind read.
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('dark', {
    getInitialValueInEffect: true,
  });
  const [darkVariant, setDarkVariant] = useState<DarkThemeVariant>('navy');

  useEffect(() => {
    setDarkVariant(getDarkTheme());
  }, []);

  const handleChange = (value: string) => {
    setColorScheme(value as 'light' | 'dark' | 'auto');
  };

  const handleDarkVariant = (value: string) => {
    const variant = value as DarkThemeVariant;
    setDarkVariant(variant);
    setDarkTheme(variant);
  };

  const isDark = computedColorScheme === 'dark';

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

        {/* Dark Theme Style */}
        {isDark && (
          <Paper p="lg" withBorder className="bg-surface-secondary">
            <Text fw={500} className="text-text-primary mb-1">
              Dark theme style
            </Text>
            <Text size="sm" c="dimmed" mb="md">
              Choose the color palette for dark mode
            </Text>

            <SegmentedControl
              value={darkVariant}
              onChange={handleDarkVariant}
              data={[
                {
                  value: 'navy',
                  label: (
                    <Group gap="xs" wrap="nowrap">
                      <Box
                        w={16}
                        h={16}
                        style={{
                          borderRadius: 3,
                          background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-info))',
                        }}
                      />
                      <span>Navy</span>
                    </Group>
                  ),
                },
                {
                  value: 'slate',
                  label: (
                    <Group gap="xs" wrap="nowrap">
                      <Box
                        w={16}
                        h={16}
                        style={{
                          borderRadius: 3,
                          background: 'linear-gradient(135deg, var(--color-text-disabled), var(--color-text-secondary))',
                        }}
                      />
                      <span>Slate</span>
                    </Group>
                  ),
                },
              ]}
              fullWidth
            />
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
