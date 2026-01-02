"use client";

import { Container, Title, Text, Button, Group, Paper, Stack, Loader, Center } from "@mantine/core";
import { IconArrowLeft, IconTarget } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WheelOfLifeCoach } from "~/app/_components/wheel-of-life/WheelOfLifeCoach";
import { api } from "~/trpc/react";

function CoachContent() {
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get("assessment");

  const { data: latestAssessment, isLoading } = api.wheelOfLife.getLatestAssessment.useQuery(
    undefined,
    { enabled: !assessmentId }
  );

  const effectiveAssessmentId = assessmentId ?? latestAssessment?.id;

  if (isLoading && !assessmentId) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!effectiveAssessmentId) {
    return (
      <Paper p="xl" radius="md" className="bg-surface-secondary border border-border-primary">
        <Stack align="center" gap="md" py="xl">
          <div className="text-6xl">🎯</div>
          <Title order={3} ta="center">
            No Assessment Found
          </Title>
          <Text c="dimmed" ta="center" maw={400}>
            Complete a Wheel of Life assessment first to get personalized coaching.
          </Text>
          <Button
            component={Link}
            href="/wheel-of-life/assessment"
            leftSection={<IconTarget size={18} />}
          >
            Take Assessment
          </Button>
        </Stack>
      </Paper>
    );
  }

  return <WheelOfLifeCoach assessmentId={effectiveAssessmentId} />;
}

export default function WheelOfLifeCoachPage() {
  return (
    <Container size="lg" className="py-8">
      {/* Header */}
      <div className="mb-6">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <Button
                component={Link}
                href="/wheel-of-life"
                variant="subtle"
                size="compact-sm"
                leftSection={<IconArrowLeft size={16} />}
              >
                Back to Dashboard
              </Button>
            </Group>
            <Title
              order={1}
              className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent"
            >
              Life Coaching Session
            </Title>
            <Text c="dimmed" size="sm" mt={4}>
              Get personalized guidance based on your assessment results
            </Text>
          </div>
        </Group>
      </div>

      {/* Coach Chat */}
      <Suspense
        fallback={
          <Center h={400}>
            <Loader size="lg" />
          </Center>
        }
      >
        <CoachContent />
      </Suspense>
    </Container>
  );
}
