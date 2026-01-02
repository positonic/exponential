"use client";

import { Paper, Title, Text, Group, Stack, Badge, Button, SimpleGrid } from "@mantine/core";
import { IconArrowRight, IconTarget } from "@tabler/icons-react";
import Link from "next/link";
import { PriorityGapChart } from "./PriorityGapChart";
import { calculatePriorityGaps } from "~/server/services/wheelOfLifeService";

interface LifeDomain {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface Score {
  id: string;
  assessmentId: string;
  lifeDomainId: number;
  currentRank: number;
  desiredRank: number;
  score: number | null;
  reflection: string | null;
  lifeDomain: LifeDomain;
}

interface Recommendation {
  id: string;
  assessmentId: string;
  lifeDomainId: number;
  recommendation: string;
  suggestedGoal: string | null;
  priority: string;
  goalCreated: boolean;
  goalId: number | null;
}

interface Assessment {
  id: string;
  userId: string;
  completedAt: Date;
  mode: string;
  type: string;
  quarterYear: string | null;
  notes: string | null;
  scores: Score[];
  recommendations: Recommendation[];
}

interface WheelOfLifeDashboardProps {
  assessment: Assessment;
}

export function WheelOfLifeDashboard({ assessment }: WheelOfLifeDashboardProps) {
  const gaps = calculatePriorityGaps(assessment.scores);
  const areasNeedingAttention = gaps.filter((g) => g.needsAttention);

  return (
    <Stack gap="lg">
      {/* Summary Header */}
      <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <Title order={3}>Latest Assessment</Title>
              <Badge variant="light" color={assessment.mode === "deep" ? "violet" : "blue"}>
                {assessment.mode === "deep" ? "Deep" : "Quick"} Mode
              </Badge>
              {assessment.type === "quarterly" && (
                <Badge variant="light" color="green">
                  {assessment.quarterYear}
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              Completed {new Date(assessment.completedAt).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </div>
          <Group>
            <Button
              component={Link}
              href="/wheel-of-life/assessment"
              variant="light"
              leftSection={<IconTarget size={16} />}
            >
              New Assessment
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Priority Gap Chart */}
      <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
        <Title order={4} mb="md">
          Priority Gap Analysis
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Shows the gap between your current priorities and desired priorities.
          Positive gaps indicate areas where you want to invest more.
        </Text>
        <PriorityGapChart scores={assessment.scores} />
      </Paper>

      {/* Areas Needing Attention */}
      {areasNeedingAttention.length > 0 && (
        <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
          <Title order={4} mb="md">
            Areas Needing Attention
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {areasNeedingAttention.slice(0, 4).map((area) => (
              <Paper
                key={area.lifeDomainId}
                p="md"
                radius="sm"
                className="bg-surface-primary border border-border-primary"
              >
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>{area.title}</Text>
                  <Badge
                    color={area.gap > 3 ? "red" : area.gap > 1 ? "orange" : "yellow"}
                    variant="light"
                  >
                    Gap: {area.gap > 0 ? "+" : ""}{area.gap}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Current: #{area.currentRank} → Desired: #{area.desiredRank}
                </Text>
                {area.score !== null && area.score !== undefined && (
                  <Text size="sm" c={area.score <= 5 ? "red" : "dimmed"} mt="xs">
                    Satisfaction: {area.score}/10
                  </Text>
                )}
              </Paper>
            ))}
          </SimpleGrid>
        </Paper>
      )}

      {/* Recommendations */}
      {assessment.recommendations.length > 0 && (
        <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
          <Group justify="space-between" mb="md">
            <Title order={4}>AI Recommendations</Title>
            <Button
              variant="subtle"
              size="xs"
              rightSection={<IconArrowRight size={14} />}
            >
              View All
            </Button>
          </Group>
          <Stack gap="sm">
            {assessment.recommendations.slice(0, 3).map((rec) => (
              <Paper
                key={rec.id}
                p="md"
                radius="sm"
                className="bg-surface-primary border border-border-primary"
              >
                <Group justify="space-between" mb="xs">
                  <Badge
                    color={
                      rec.priority === "high"
                        ? "red"
                        : rec.priority === "medium"
                        ? "yellow"
                        : "gray"
                    }
                    variant="light"
                    size="sm"
                  >
                    {rec.priority} priority
                  </Badge>
                  {rec.goalCreated && (
                    <Badge color="green" variant="light" size="sm">
                      Goal Created
                    </Badge>
                  )}
                </Group>
                <Text size="sm">{rec.recommendation}</Text>
                {rec.suggestedGoal && !rec.goalCreated && (
                  <Button variant="light" size="xs" mt="sm">
                    Create Goal: {rec.suggestedGoal}
                  </Button>
                )}
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Notes */}
      {assessment.notes && (
        <Paper p="lg" radius="md" className="bg-surface-secondary border border-border-primary">
          <Title order={4} mb="md">
            Your Notes
          </Title>
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {assessment.notes}
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
