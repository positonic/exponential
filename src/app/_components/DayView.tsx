'use client';

import { Container, Title, Paper, Stack, Group, Button } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { type Day } from "@prisma/client";
import { StartupRoutineForm } from './StartupRoutineForm';

interface DayViewProps {
  day: Day & {
    exercises: any[];
    notes: any[];
  };
}

export function DayView({ day }: DayViewProps) {
  const router = useRouter();

  return (
    <Container size="md" className="py-8">
      <Stack gap="lg">
        <Group justify="space-between">
          <Button 
            variant="subtle" 
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => router.back()}
          >
            Back to Days
          </Button>
          <Button 
            variant="subtle" 
            rightSection={<IconArrowRight size={16} />} 
            onClick={() => router.push('/today')}
          >
            Today&apos;s Actions
          </Button>
        </Group>

        <Title order={2} className="flex items-center gap-2">
          <span>🌻</span>
          {day.date.toLocaleDateString()}
        </Title>

        <StartupRoutineForm />
      </Stack>
    </Container>
  );
} 