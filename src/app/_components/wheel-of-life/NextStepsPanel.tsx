"use client";

import { Paper, Title, Text, Button, SimpleGrid } from "@mantine/core";
import { IconTarget, IconMessageCircle, IconChartBar, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";

interface NextStepsPanelProps {
  assessmentId: string;
  hasHistory: boolean;
  areasNeedingAttention: Array<{
    lifeDomainId: number;
    title: string;
    gap: number;
  }>;
  onCompare?: () => void;
}

export function NextStepsPanel({
  assessmentId,
  hasHistory,
  areasNeedingAttention,
  onCompare,
}: NextStepsPanelProps) {
  const topArea = areasNeedingAttention[0];

  const goalTrigger = topArea ? (
    <Button
      variant="light"
      color="green"
      leftSection={<IconPlus size={18} />}
      fullWidth
      styles={{
        root: { height: "auto", padding: "12px" },
        inner: { flexDirection: "column", gap: 4 },
        label: { flexDirection: "column", gap: 4 },
      }}
    >
      <Text size="sm" fw={600}>
        Create Goal
      </Text>
      <Text size="xs" c="dimmed">
        Focus on {topArea.title.split("/")[0]}
      </Text>
    </Button>
  ) : null;

  return (
    <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
      <Title order={4} mb="xs">
        Next Steps
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Take action on your assessment results
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
        {/* Talk to Coach */}
        <Button
          component={Link}
          href={`/wheel-of-life/coach?assessment=${assessmentId}`}
          variant="light"
          leftSection={<IconMessageCircle size={18} />}
          fullWidth
          styles={{
            root: { height: "auto", padding: "12px" },
            inner: { flexDirection: "column", gap: 4 },
            label: { flexDirection: "column", gap: 4 },
          }}
        >
          <Text size="sm" fw={600}>
            Talk to Coach
          </Text>
          <Text size="xs" c="dimmed">
            Get personalized advice
          </Text>
        </Button>

        {/* Create Goal */}
        {topArea && (
          <CreateGoalModal
            trigger={goalTrigger}
            goal={{
              id: 0,
              title: `Improve ${topArea.title.split("/")[0]}`,
              description: null,
              dueDate: null,
              lifeDomainId: topArea.lifeDomainId,
            }}
          />
        )}

        {/* Compare Progress */}
        {hasHistory && onCompare && (
          <Button
            variant="light"
            color="violet"
            leftSection={<IconChartBar size={18} />}
            fullWidth
            onClick={onCompare}
            styles={{
              root: { height: "auto", padding: "12px" },
              inner: { flexDirection: "column", gap: 4 },
              label: { flexDirection: "column", gap: 4 },
            }}
          >
            <Text size="sm" fw={600}>
              Compare Progress
            </Text>
            <Text size="xs" c="dimmed">
              See how you have changed
            </Text>
          </Button>
        )}

        {/* New Assessment */}
        <Button
          component={Link}
          href="/wheel-of-life/assessment"
          variant="light"
          color="gray"
          leftSection={<IconTarget size={18} />}
          fullWidth
          styles={{
            root: { height: "auto", padding: "12px" },
            inner: { flexDirection: "column", gap: 4 },
            label: { flexDirection: "column", gap: 4 },
          }}
        >
          <Text size="sm" fw={600}>
            New Assessment
          </Text>
          <Text size="xs" c="dimmed">
            Start fresh evaluation
          </Text>
        </Button>
      </SimpleGrid>
    </Paper>
  );
}
