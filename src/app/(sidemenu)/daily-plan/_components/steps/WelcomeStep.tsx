"use client";

import { Stack, Title, Text, Button } from "@mantine/core";

interface WelcomeStepProps {
  onStart: () => void;
}

export function WelcomeStep({ onStart }: WelcomeStepProps) {
  return (
    <Stack align="flex-start" gap="xl" py={60} maw={400}>
      <div>
        <Title
          order={2}
          className="text-text-primary"
          style={{ fontStyle: "italic" }}
        >
          Welcome to your new daily planning routine
        </Title>
        <Text c="dimmed" mt="md">
          Once per day, we will help you plan your day.
        </Text>
      </div>

      <Button
        size="lg"
        variant="default"
        onClick={onStart}
        className="border-border-primary"
      >
        Plan today
      </Button>
    </Stack>
  );
}
