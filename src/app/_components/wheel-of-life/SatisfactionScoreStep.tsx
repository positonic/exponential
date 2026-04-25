"use client";

import { Paper, Title, Text, Stack, Slider, Group, Badge, SimpleGrid } from "@mantine/core";

interface LifeDomain {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface SatisfactionScoreStepProps {
  domains: LifeDomain[];
  scores: Record<number, number>;
  onScoresChange: (scores: Record<number, number>) => void;
}

const scoreLabels: Record<number, { label: string; color: string }> = {
  1: { label: "Very Low", color: "red" },
  2: { label: "Low", color: "red" },
  3: { label: "Poor", color: "orange" },
  4: { label: "Below Average", color: "orange" },
  5: { label: "Average", color: "yellow" },
  6: { label: "Above Average", color: "yellow" },
  7: { label: "Good", color: "lime" },
  8: { label: "Very Good", color: "green" },
  9: { label: "Excellent", color: "green" },
  10: { label: "Thriving", color: "teal" },
};

export function SatisfactionScoreStep({
  domains,
  scores,
  onScoresChange,
}: SatisfactionScoreStepProps) {
  const handleScoreChange = (domainId: number, value: number) => {
    onScoresChange({
      ...scores,
      [domainId]: value,
    });
  };

  const getScoreInfo = (score: number | undefined) => {
    if (!score) return { label: "Not rated", color: "gray" };
    return scoreLabels[score] ?? { label: "Unknown", color: "gray" };
  };

  return (
    <Stack gap="lg">
      <div className="text-center mb-2">
        <Title order={3} mb="xs">
          Rate Your Satisfaction
        </Title>
        <Text c="dimmed" size="sm" maw={600} mx="auto">
          How satisfied are you in each area? Be honest - this helps identify where you need the most improvement.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {domains.map((domain) => {
          const currentScore = scores[domain.id] ?? 5;
          const scoreInfo = getScoreInfo(scores[domain.id]);

          return (
            <Paper
              key={domain.id}
              p="md"
              radius="md"
              className="bg-surface-primary border border-border-primary"
            >
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">
                  {domain.title}
                </Text>
                <Badge
                  color={scoreInfo.color}
                  variant="light"
                  size="sm"
                >
                  {scores[domain.id] ? `${scores[domain.id]}/10 - ${scoreInfo.label}` : "Not rated"}
                </Badge>
              </Group>

              {domain.description && (
                <Text size="xs" c="dimmed" mb="md" lineClamp={2}>
                  {domain.description}
                </Text>
              )}

              <Slider
                value={currentScore}
                onChange={(value) => handleScoreChange(domain.id, value)}
                min={1}
                max={10}
                step={1}
                marks={[
                  { value: 1, label: "1" },
                  { value: 5, label: "5" },
                  { value: 10, label: "10" },
                ]}
                color={scoreInfo.color}
                size="md"
              />
            </Paper>
          );
        })}
      </SimpleGrid>

      <Paper p="md" radius="md" className="bg-surface-secondary border border-border-primary">
        <Text size="xs" c="dimmed" ta="center">
          <strong>Score Guide:</strong> 1-3 = Struggling | 4-5 = Needs Work | 6-7 = Good | 8-10 = Thriving
        </Text>
      </Paper>
    </Stack>
  );
}
