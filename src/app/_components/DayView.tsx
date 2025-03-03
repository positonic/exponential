'use client';

import { Container, Title, Paper, Stack, Group, Button } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { type Day } from "@prisma/client";

interface DayViewProps {
  day: Day & {
    exercises: any[];
    journals: any[];
    users: any[];
  };
}

export function DayView({ day }: DayViewProps) {
  const router = useRouter();

  return (
    <Container size="md" className="py-8">
      <Stack gap="lg">
        <Group>
          <Button 
            variant="subtle" 
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => router.back()}
          >
            Back to Days
          </Button>
        </Group>

        <Title order={2} className="flex items-center gap-2">
          <span>🌻</span>
          {day.date.toLocaleDateString()}
        </Title>

        <Paper p="md" className="bg-[#262626]">
          <Stack gap="md">
            <p className="text-gray-400">
              This is where you can add specific content for {day.date.toLocaleDateString()}. 
              You might want to include:
            </p>
            <ul className="list-disc list-inside text-gray-400">
              <li>Tasks completed</li>
              <li>Notes or journal entries</li>
              <li>Metrics or tracking data</li>
              <li>Links to related items</li>
            </ul>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
} 