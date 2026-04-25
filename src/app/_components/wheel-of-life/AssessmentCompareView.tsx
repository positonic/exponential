"use client";

import { Paper, Title, Text, Stack, Group, Badge, Table, Loader, Center } from "@mantine/core";
import { IconArrowUp, IconArrowDown, IconMinus } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { calculatePriorityGaps } from "~/server/services/wheelOfLifeService";

interface AssessmentCompareViewProps {
  currentAssessmentId: string;
  compareAssessmentId: string;
}

export function AssessmentCompareView({
  currentAssessmentId,
  compareAssessmentId,
}: AssessmentCompareViewProps) {
  const { data: currentAssessment, isLoading: loadingCurrent } =
    api.wheelOfLife.getAssessment.useQuery({ id: currentAssessmentId });
  const { data: compareAssessment, isLoading: loadingCompare } =
    api.wheelOfLife.getAssessment.useQuery({ id: compareAssessmentId });

  if (loadingCurrent || loadingCompare) {
    return (
      <Center py="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (!currentAssessment || !compareAssessment) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Unable to load assessments for comparison.
      </Text>
    );
  }

  const currentGaps = calculatePriorityGaps(currentAssessment.scores);
  const previousGaps = calculatePriorityGaps(compareAssessment.scores);

  // Create a map for easy lookup
  const previousGapMap = new Map(previousGaps.map((g) => [g.lifeDomainId, g]));

  // Calculate changes
  const comparison = currentGaps.map((current) => {
    const previous = previousGapMap.get(current.lifeDomainId);
    const gapChange = previous ? previous.gap - current.gap : 0;
    const scoreChange =
      current.score !== null && previous?.score !== null
        ? (current.score ?? 0) - (previous?.score ?? 0)
        : null;

    return {
      ...current,
      previousGap: previous?.gap ?? 0,
      previousScore: previous?.score ?? null,
      gapChange,
      scoreChange,
      improved: gapChange > 0,
      regressed: gapChange < 0,
    };
  });

  const improvedAreas = comparison.filter((c) => c.improved);
  const regressedAreas = comparison.filter((c) => c.regressed);
  const unchangedAreas = comparison.filter((c) => !c.improved && !c.regressed);

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Text size="sm" c="dimmed">
            Comparing
          </Text>
          <Text fw={600}>{formatDate(currentAssessment.completedAt)}</Text>
        </div>
        <Text size="xl" c="dimmed">
          vs
        </Text>
        <div>
          <Text size="sm" c="dimmed">
            Previous
          </Text>
          <Text fw={600}>{formatDate(compareAssessment.completedAt)}</Text>
        </div>
      </Group>

      {/* Summary Stats */}
      <Group grow>
        <Paper p="md" radius="md" className="bg-green-500/10 border border-green-500/20">
          <Text size="xs" c="green" fw={600}>
            Improved
          </Text>
          <Text size="xl" fw={700}>
            {improvedAreas.length}
          </Text>
          <Text size="xs" c="dimmed">
            {improvedAreas.length > 0
              ? improvedAreas
                  .slice(0, 2)
                  .map((a) => a.title.split("/")[0])
                  .join(", ")
              : "None"}
          </Text>
        </Paper>

        <Paper p="md" radius="md" className="bg-gray-500/10 border border-gray-500/20">
          <Text size="xs" c="dimmed" fw={600}>
            Unchanged
          </Text>
          <Text size="xl" fw={700}>
            {unchangedAreas.length}
          </Text>
          <Text size="xs" c="dimmed">
            {unchangedAreas.length > 0
              ? unchangedAreas
                  .slice(0, 2)
                  .map((a) => a.title.split("/")[0])
                  .join(", ")
              : "None"}
          </Text>
        </Paper>

        <Paper p="md" radius="md" className="bg-red-500/10 border border-red-500/20">
          <Text size="xs" c="red" fw={600}>
            Needs Attention
          </Text>
          <Text size="xl" fw={700}>
            {regressedAreas.length}
          </Text>
          <Text size="xs" c="dimmed">
            {regressedAreas.length > 0
              ? regressedAreas
                  .slice(0, 2)
                  .map((a) => a.title.split("/")[0])
                  .join(", ")
              : "None"}
          </Text>
        </Paper>
      </Group>

      {/* Detailed Comparison Table */}
      <Paper p="md" radius="md" className="bg-surface-primary border border-border-primary">
        <Title order={5} mb="md">
          Detailed Comparison
        </Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Area</Table.Th>
              <Table.Th ta="center">Previous Gap</Table.Th>
              <Table.Th ta="center">Current Gap</Table.Th>
              <Table.Th ta="center">Change</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {comparison.map((item) => (
              <Table.Tr key={item.lifeDomainId}>
                <Table.Td>
                  <Text size="sm" fw={item.improved || item.regressed ? 600 : 400}>
                    {item.title}
                  </Text>
                </Table.Td>
                <Table.Td ta="center">
                  <Badge
                    variant="light"
                    color={
                      item.previousGap > 0 ? "orange" : item.previousGap < 0 ? "blue" : "green"
                    }
                  >
                    {item.previousGap > 0 ? "+" : ""}
                    {item.previousGap}
                  </Badge>
                </Table.Td>
                <Table.Td ta="center">
                  <Badge
                    variant="light"
                    color={item.gap > 0 ? "orange" : item.gap < 0 ? "blue" : "green"}
                  >
                    {item.gap > 0 ? "+" : ""}
                    {item.gap}
                  </Badge>
                </Table.Td>
                <Table.Td ta="center">
                  <Group gap={4} justify="center">
                    {item.gapChange > 0 ? (
                      <IconArrowDown size={14} className="text-green-500" />
                    ) : item.gapChange < 0 ? (
                      <IconArrowUp size={14} className="text-red-500" />
                    ) : (
                      <IconMinus size={14} className="text-gray-500" />
                    )}
                    <Text
                      size="sm"
                      fw={600}
                      c={item.gapChange > 0 ? "green" : item.gapChange < 0 ? "red" : "dimmed"}
                    >
                      {item.gapChange > 0 ? "Improving" : item.gapChange < 0 ? "Regressing" : "Same"}
                    </Text>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Score Comparison (if both are deep mode) */}
      {currentAssessment.mode === "deep" && compareAssessment.mode === "deep" && (
        <Paper p="md" radius="md" className="bg-surface-primary border border-border-primary">
          <Title order={5} mb="md">
            Satisfaction Score Changes
          </Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Area</Table.Th>
                <Table.Th ta="center">Previous</Table.Th>
                <Table.Th ta="center">Current</Table.Th>
                <Table.Th ta="center">Change</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {comparison
                .filter((item) => item.score !== null || item.previousScore !== null)
                .map((item) => (
                  <Table.Tr key={item.lifeDomainId}>
                    <Table.Td>
                      <Text size="sm">{item.title}</Text>
                    </Table.Td>
                    <Table.Td ta="center">
                      {item.previousScore !== null ? (
                        <Badge
                          variant="light"
                          color={
                            item.previousScore <= 3
                              ? "red"
                              : item.previousScore <= 5
                                ? "orange"
                                : item.previousScore <= 7
                                  ? "yellow"
                                  : "green"
                          }
                        >
                          {item.previousScore}/10
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          -
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      {item.score != null ? (
                        <Badge
                          variant="light"
                          color={
                            item.score <= 3
                              ? "red"
                              : item.score <= 5
                                ? "orange"
                                : item.score <= 7
                                  ? "yellow"
                                  : "green"
                          }
                        >
                          {item.score}/10
                        </Badge>
                      ) : (
                        <Text size="xs" c="dimmed">
                          -
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      {item.scoreChange !== null ? (
                        <Group gap={4} justify="center">
                          {item.scoreChange > 0 ? (
                            <IconArrowUp size={14} className="text-green-500" />
                          ) : item.scoreChange < 0 ? (
                            <IconArrowDown size={14} className="text-red-500" />
                          ) : (
                            <IconMinus size={14} className="text-gray-500" />
                          )}
                          <Text
                            size="sm"
                            fw={600}
                            c={
                              item.scoreChange > 0
                                ? "green"
                                : item.scoreChange < 0
                                  ? "red"
                                  : "dimmed"
                            }
                          >
                            {item.scoreChange > 0 ? "+" : ""}
                            {item.scoreChange}
                          </Text>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed">
                          -
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
