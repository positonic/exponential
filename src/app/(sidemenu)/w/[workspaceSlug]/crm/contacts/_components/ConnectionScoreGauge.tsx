"use client";

import { RingProgress, Stack, Text, Center, Table, Paper, Group, Badge, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface ConnectionScoreGaugeProps {
  contactId: string;
  size?: number;
  showBreakdown?: boolean;
}

export function ConnectionScoreGauge({
  contactId,
  size = 120,
  showBreakdown = true,
}: ConnectionScoreGaugeProps) {
  const { data: breakdown, isLoading } = api.crmContact.getScoreBreakdown.useQuery(
    { contactId }
  );

  if (isLoading) {
    return (
      <Center h={size}>
        <Text size="sm" c="dimmed">
          Loading...
        </Text>
      </Center>
    );
  }

  if (!breakdown) {
    return (
      <Center h={size}>
        <Text size="sm" c="dimmed">
          No score data
        </Text>
      </Center>
    );
  }

  const totalScore = breakdown.totalScore;
  const scoreColor = getScoreColor(totalScore);
  const scoreLabel = getScoreLabel(totalScore);

  return (
    <Stack gap="md">
      <Center>
        <RingProgress
          size={size}
          thickness={12}
          roundCaps
          sections={[
            {
              value: totalScore,
              color: scoreColor,
            },
          ]}
          label={
            <Stack gap={0} align="center">
              <Text size="xl" fw={700}>
                {totalScore}
              </Text>
              <Text size="xs" c="dimmed">
                / 100
              </Text>
            </Stack>
          }
        />
      </Center>

      <Center>
        <Badge color={scoreColor} size="lg" variant="light">
          {scoreLabel}
        </Badge>
      </Center>

      {showBreakdown && (
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Score Breakdown
              </Text>
              <Tooltip
                label="Connection score is calculated based on recency, frequency, type, and duration of interactions"
                multiline
                w={200}
              >
                <IconInfoCircle size={16} style={{ cursor: "help" }} />
              </Tooltip>
            </Group>

            <Table>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm">Recency</Text>
                      <Tooltip
                        label="How recently you interacted (max 40 points)"
                        multiline
                        w={180}
                      >
                        <IconInfoCircle size={14} style={{ cursor: "help" }} />
                      </Tooltip>
                    </Group>
                  </Table.Td>
                  <Table.Td align="right">
                    <Group gap="xs" justify="flex-end">
                      <Text size="sm" fw={500}>
                        {breakdown.recency}
                      </Text>
                      <Text size="sm" c="dimmed">
                        / 40
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td w={100}>
                    <RingProgress
                      size={40}
                      thickness={4}
                      sections={[
                        {
                          value: (breakdown.recency / 40) * 100,
                          color: getComponentColor(breakdown.recency, 40),
                        },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>

                <Table.Tr>
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm">Frequency</Text>
                      <Tooltip
                        label="How often you interact (max 30 points)"
                        multiline
                        w={180}
                      >
                        <IconInfoCircle size={14} style={{ cursor: "help" }} />
                      </Tooltip>
                    </Group>
                  </Table.Td>
                  <Table.Td align="right">
                    <Group gap="xs" justify="flex-end">
                      <Text size="sm" fw={500}>
                        {breakdown.frequency}
                      </Text>
                      <Text size="sm" c="dimmed">
                        / 30
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td w={100}>
                    <RingProgress
                      size={40}
                      thickness={4}
                      sections={[
                        {
                          value: (breakdown.frequency / 30) * 100,
                          color: getComponentColor(breakdown.frequency, 30),
                        },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>

                <Table.Tr>
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm">Interaction Type</Text>
                      <Tooltip
                        label="Quality of interactions (meetings > emails, max 20 points)"
                        multiline
                        w={200}
                      >
                        <IconInfoCircle size={14} style={{ cursor: "help" }} />
                      </Tooltip>
                    </Group>
                  </Table.Td>
                  <Table.Td align="right">
                    <Group gap="xs" justify="flex-end">
                      <Text size="sm" fw={500}>
                        {breakdown.interactionType}
                      </Text>
                      <Text size="sm" c="dimmed">
                        / 20
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td w={100}>
                    <RingProgress
                      size={40}
                      thickness={4}
                      sections={[
                        {
                          value: (breakdown.interactionType / 20) * 100,
                          color: getComponentColor(breakdown.interactionType, 20),
                        },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>

                <Table.Tr>
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm">Duration</Text>
                      <Tooltip
                        label="Length of meetings (max 10 points)"
                        multiline
                        w={180}
                      >
                        <IconInfoCircle size={14} style={{ cursor: "help" }} />
                      </Tooltip>
                    </Group>
                  </Table.Td>
                  <Table.Td align="right">
                    <Group gap="xs" justify="flex-end">
                      <Text size="sm" fw={500}>
                        {breakdown.duration}
                      </Text>
                      <Text size="sm" c="dimmed">
                        / 10
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td w={100}>
                    <RingProgress
                      size={40}
                      thickness={4}
                      sections={[
                        {
                          value: (breakdown.duration / 10) * 100,
                          color: getComponentColor(breakdown.duration, 10),
                        },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>

            {breakdown.details && (
              <Stack gap="xs" mt="xs">
                <Text size="xs" c="dimmed">
                  {breakdown.details.totalInteractions ?? 0} total interactions
                </Text>
                {breakdown.details.mostRecentInteraction && (
                  <Text size="xs" c="dimmed">
                    Last interaction:{" "}
                    {new Date(breakdown.details.mostRecentInteraction).toLocaleDateString()}
                  </Text>
                )}
              </Stack>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

// Compact version for table cells
export function ConnectionScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return (
      <Badge color="gray" variant="light">
        N/A
      </Badge>
    );
  }

  const scoreColor = getScoreColor(score);

  return (
    <Tooltip label={`${getScoreLabel(score)} connection`} withArrow>
      <Badge color={scoreColor} variant="light">
        {score}
      </Badge>
    </Tooltip>
  );
}

// Helper functions
function getScoreColor(score: number): string {
  if (score >= 81) return "green";
  if (score >= 61) return "teal";
  if (score >= 41) return "yellow";
  if (score >= 21) return "orange";
  return "red";
}

function getScoreLabel(score: number): string {
  if (score >= 81) return "Strong";
  if (score >= 61) return "Good";
  if (score >= 41) return "Moderate";
  if (score >= 21) return "Weak";
  return "Very Weak";
}

function getComponentColor(value: number, max: number): string {
  const percentage = (value / max) * 100;
  if (percentage >= 80) return "green";
  if (percentage >= 60) return "teal";
  if (percentage >= 40) return "yellow";
  if (percentage >= 20) return "orange";
  return "red";
}
