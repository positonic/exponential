'use client';

import { Container, Title, Paper, Stack, Group, Button } from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';

export default function DayPage() {
  const params = useParams();
  const router = useRouter();
  const dayId = params.id as string;

  // In a real app, you would fetch the day's data here using the ID
  const dayData = {
    id: dayId,
    date: new Date(),
    name: `${new Date().getDate()}th ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`,
    formattedDate: new Date().toLocaleDateString(),
  };

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
          {dayData.name}
        </Title>

        <Paper p="md" className="bg-[#262626]">
          <Stack gap="md">
            {/* Add your day-specific content here */}
            <p className="text-gray-400">
              This is where you can add specific content for {dayData.name}. 
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