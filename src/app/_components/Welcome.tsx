'use client';

import Link from "next/link";
import { Button, Title, Text, Container, Stack } from '@mantine/core';
import { useTheme } from '~/providers/ThemeProvider';

export function Welcome() {
  const theme = useTheme();

  return (
    <Container size="md" className="h-screen flex items-center justify-center">
      <Stack align="center" gap="xl">
        <Title 
          order={1} 
          className={`text-5xl font-bold bg-gradient-to-r ${theme.colors.primary} bg-clip-text text-transparent`}
        >
          {theme.logo} {theme.branding.title}
        </Title>
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