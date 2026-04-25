"use client";

import { useMemo } from "react";
import { Paper, Title, Text, Stack, Table, Badge, Textarea, Group } from "@mantine/core";
import { IconArrowUp, IconArrowDown, IconMinus } from "@tabler/icons-react";

interface LifeDomain {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface AssessmentSummaryProps {
  mode: "quick" | "deep";
  domains: LifeDomain[];
  currentRanking: number[];
  desiredRanking: number[];
  satisfactionScores?: Record<number, number>;
  notes: string;
  onNotesChange: (notes: string) => void;
}

export function AssessmentSummary({
  mode,
  domains,
  currentRanking,
  desiredRanking,
  satisfactionScores,
  notes,
  onNotesChange,
}: AssessmentSummaryProps) {
  const summaryData = useMemo(() => {
    return domains
      .map((domain) => {
        const currentRank = currentRanking.indexOf(domain.id) + 1;
        const desiredRank = desiredRanking.indexOf(domain.id) + 1;
        const gap = currentRank - desiredRank;
        const score = satisfactionScores?.[domain.id];

        return {
          domain,
          currentRank,
          desiredRank,
          gap,
          score,
          needsAttention: gap > 0 || (score !== undefined && score <= 5),
        };
      })
      .sort((a, b) => b.gap - a.gap); // Sort by largest gap first
  }, [domains, currentRanking, desiredRanking, satisfactionScores]);

  const areasNeedingMoreFocus = summaryData.filter((d) => d.gap > 0);
  const areasOverinvested = summaryData.filter((d) => d.gap < 0);
  const balancedAreas = summaryData.filter((d) => d.gap === 0);

  return (
    <Stack gap="lg">
      <div className="text-center mb-2">
        <Title order={3} mb="xs">
          Assessment Summary
        </Title>
        <Text c="dimmed" size="sm">
          Review your results before completing the assessment
        </Text>
      </div>

      {/* Quick Insights */}
      <Group grow>
        <Paper p="md" radius="md" className="bg-orange-500/10 border border-orange-500/20">
          <Text size="xs" c="orange" fw={600} mb="xs">
            Needs More Focus
          </Text>
          <Text size="xl" fw={700}>
            {areasNeedingMoreFocus.length}
          </Text>
          <Text size="xs" c="dimmed">
            {areasNeedingMoreFocus.length > 0
              ? areasNeedingMoreFocus
                  .slice(0, 2)
                  .map((d) => d.domain.title.split("/")[0])
                  .join(", ")
              : "None"}
          </Text>
        </Paper>

        <Paper p="md" radius="md" className="bg-green-500/10 border border-green-500/20">
          <Text size="xs" c="green" fw={600} mb="xs">
            Balanced
          </Text>
          <Text size="xl" fw={700}>
            {balancedAreas.length}
          </Text>
          <Text size="xs" c="dimmed">
            {balancedAreas.length > 0
              ? balancedAreas
                  .slice(0, 2)
                  .map((d) => d.domain.title.split("/")[0])
                  .join(", ")
              : "None"}
          </Text>
        </Paper>

        <Paper p="md" radius="md" className="bg-blue-500/10 border border-blue-500/20">
          <Text size="xs" c="blue" fw={600} mb="xs">
            Could Reduce
          </Text>
          <Text size="xl" fw={700}>
            {areasOverinvested.length}
          </Text>
          <Text size="xs" c="dimmed">
            {areasOverinvested.length > 0
              ? areasOverinvested
                  .slice(0, 2)
                  .map((d) => d.domain.title.split("/")[0])
                  .join(", ")
              : "None"}
          </Text>
        </Paper>
      </Group>

      {/* Detailed Table */}
      <Paper p="md" radius="md" className="bg-surface-primary border border-border-primary">
        <Title order={5} mb="md">
          Priority Gap Analysis
        </Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Area</Table.Th>
              <Table.Th ta="center">Current</Table.Th>
              <Table.Th ta="center">Desired</Table.Th>
              <Table.Th ta="center">Gap</Table.Th>
              {mode === "deep" && <Table.Th ta="center">Score</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {summaryData.map((item) => (
              <Table.Tr key={item.domain.id}>
                <Table.Td>
                  <Text size="sm" fw={item.needsAttention ? 600 : 400}>
                    {item.domain.title}
                  </Text>
                </Table.Td>
                <Table.Td ta="center">
                  <Badge variant="light" color="gray">
                    #{item.currentRank}
                  </Badge>
                </Table.Td>
                <Table.Td ta="center">
                  <Badge variant="light" color="gray">
                    #{item.desiredRank}
                  </Badge>
                </Table.Td>
                <Table.Td ta="center">
                  <Group gap={4} justify="center">
                    {item.gap > 0 ? (
                      <IconArrowUp size={14} className="text-orange-500" />
                    ) : item.gap < 0 ? (
                      <IconArrowDown size={14} className="text-blue-500" />
                    ) : (
                      <IconMinus size={14} className="text-green-500" />
                    )}
                    <Badge
                      variant="light"
                      color={
                        item.gap > 0 ? "orange" : item.gap < 0 ? "blue" : "green"
                      }
                    >
                      {item.gap > 0 ? "+" : ""}
                      {item.gap}
                    </Badge>
                  </Group>
                </Table.Td>
                {mode === "deep" && (
                  <Table.Td ta="center">
                    {item.score !== undefined ? (
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
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Notes */}
      <Paper p="md" radius="md" className="bg-surface-primary border border-border-primary">
        <Title order={5} mb="md">
          Reflection Notes (Optional)
        </Title>
        <Textarea
          placeholder="Any thoughts or insights from this assessment? What patterns do you notice? What would you like to change?"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          minRows={3}
          maxRows={6}
          autosize
        />
      </Paper>
    </Stack>
  );
}
