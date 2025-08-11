'use client';

import Link from "next/link";
import { Button, Text, Container, Stack } from '@mantine/core';
import { useTheme } from '~/providers/ThemeProvider';
import { LogoDisplay } from './layout/LogoDisplay';

export function Welcome() {
  const { theme } = useTheme();

  return (
    <Container size="md" className="h-screen flex items-center justify-center">
      <Stack align="center" gap="xl">
        <LogoDisplay theme={theme} className="text-5xl" />
        <Text c="dimmed" size="xl" ta="center" className="max-w-lg">
          {theme.branding.description}
        </Text>
        <Button
          component={Link}
          href="/use-the-force"
          size="lg"
          radius="md"
          className={`bg-gradient-to-r ${theme.colors.secondary} hover:opacity-90 transition-all`}
        >
          Get Started
        </Button>
      </Stack>
    </Container>
  );
} 