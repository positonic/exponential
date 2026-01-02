"use client";

import { Container, Title, Button, Text, Paper, Group, Stack, Loader, Center } from "@mantine/core";
import { IconCirclePlus } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { WheelOfLifeDashboard } from "~/app/_components/wheel-of-life/WheelOfLifeDashboard";
import { QuarterlyPromptBanner } from "~/app/_components/wheel-of-life/QuarterlyPromptBanner";

export default function WheelOfLifePage() {
  const { data: latestAssessment, isLoading } = api.wheelOfLife.getLatestAssessment.useQuery();
  const { data: quarterlyStatus } = api.wheelOfLife.checkQuarterlyDue.useQuery();

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Center h={400}>
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-8">
      {/* Quarterly Reminder Banner */}
      {quarterlyStatus?.isDue && (
        <QuarterlyPromptBanner currentQuarter={quarterlyStatus.currentQuarter} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Title
            order={1}
            className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
          >
            Wheel of Life
          </Title>
          <Text c="dimmed" size="sm" mt={4}>
            Assess and balance the key areas of your life
          </Text>
        </div>
        <Group>
          <Button
            component={Link}
            href="/wheel-of-life/assessment"
            variant="filled"
            leftSection={<IconCirclePlus size={18} />}
          >
            New Assessment
          </Button>
        </Group>
      </div>

      {/* Content */}
      {latestAssessment ? (
        <WheelOfLifeDashboard assessment={latestAssessment} />
      ) : (
        <Paper p="xl" radius="md" className="bg-surface-secondary border border-border-primary">
          <Stack align="center" gap="md" py="xl">
            <div className="text-6xl">🎯</div>
            <Title order={3} ta="center">
              Start Your First Assessment
            </Title>
            <Text c="dimmed" ta="center" maw={500}>
              The Wheel of Life helps you visualize how balanced your life is across different areas.
              Take a few minutes to reflect on where you are and where you want to be.
            </Text>
            <Group mt="md">
              <Button
                component={Link}
                href="/wheel-of-life/assessment"
                size="lg"
                leftSection={<IconCirclePlus size={20} />}
              >
                Take Assessment
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Container>
  );
}
