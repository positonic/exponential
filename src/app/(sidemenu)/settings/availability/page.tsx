'use client';

import Link from 'next/link';
import { Anchor, Container, Paper, Stack, Text, Title } from '@mantine/core';
import { AvailabilityPainter } from '~/app/_components/calendar/AvailabilityPainter';
import { TimeOffCard } from './TimeOffCard';

export default function AvailabilitySettingsPage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2} className="text-text-primary">
            Availability
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Mark the times you can&apos;t meet. Teammates scheduling a meeting see them as busy,
            alongside any calendar you&apos;ve connected and your{' '}
            <Anchor component={Link} href="/settings/profile" size="sm">
              work hours
            </Anchor>
            .
          </Text>
        </div>

        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Stack gap="md">
            <div>
              <Title order={4} className="text-text-primary">
                Your week
              </Title>
              <Text size="sm" c="dimmed" mt={4}>
                Drag across the grid to mark times unavailable; drag over marked time to clear
                it. Times are in your local time zone.
              </Text>
            </div>
            <AvailabilityPainter />
          </Stack>
        </Paper>

        <TimeOffCard />
      </Stack>
    </Container>
  );
}
