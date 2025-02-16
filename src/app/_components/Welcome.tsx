import Link from "next/link";
import { Button, Title, Text, Container, Stack } from '@mantine/core';

export function Welcome() {
  return (
    <Container size="md" className="h-screen flex items-center justify-center">
      <Stack align="center" gap="xl">
        <Title order={1} className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          Welcome to 🧘‍♂️ LifeOS
        </Title>
        <Text c="dimmed" size="xl" ta="center" className="max-w-lg">
          Organize your tasks, boost your productivity, and achieve your goals with our powerful task management system.
        </Text>
        <Button
          component={Link}
          href="/api/auth/signin"
          size="lg"
          radius="md"
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-all"
        >
          Get Started
        </Button>
      </Stack>
    </Container>
  );
} 