"use client";

import {
  Card,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Badge,
  Table,
  ThemeIcon,
} from "@mantine/core";
import {
  IconCheck,
  IconRefresh,
  IconArrowRight,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconConfetti,
} from "@tabler/icons-react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";

interface CheckinUpdate {
  keyResultId: string;
  keyResultTitle: string;
  objectiveTitle: string;
  previousValue: number;
  newValue: number;
  notes?: string;
}

interface WizardSummaryProps {
  updates: CheckinUpdate[];
  period: string;
  onStartOver: () => void;
  onContinue: () => void;
}

export function WizardSummary({
  updates,
  period,
  onStartOver,
  onContinue,
}: WizardSummaryProps) {
  const { workspaceSlug } = useWorkspace();

  // Calculate stats
  const totalUpdates = updates.length;
  const progressMade = updates.filter((u) => u.newValue > u.previousValue).length;
  const noChange = updates.filter((u) => u.newValue === u.previousValue).length;
  const decreased = updates.filter((u) => u.newValue < u.previousValue).length;

  // Format period label
  const periodLabel = period.replace("-", " ");

  return (
    <Stack gap="lg">
      {/* Success Header */}
      <Card withBorder p="xl" className="text-center bg-surface-secondary">
        <Stack align="center" gap="md">
          <ThemeIcon size={60} radius="xl" color="green" variant="light">
            <IconConfetti size={30} />
          </ThemeIcon>
          <div>
            <Title order={2} className="text-text-primary">
              Check-in Complete!
            </Title>
            <Text c="dimmed" mt="xs">
              You&apos;ve updated {totalUpdates} Key Results for {periodLabel}
            </Text>
          </div>
        </Stack>
      </Card>

      {/* Stats Summary */}
      <Group grow>
        <Card withBorder p="md" className="text-center">
          <Group justify="center" gap="xs" mb="xs">
            <IconTrendingUp size={20} className="text-green-500" />
            <Text size="xl" fw={700} className="text-green-500">
              {progressMade}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">Progressed</Text>
        </Card>
        <Card withBorder p="md" className="text-center">
          <Group justify="center" gap="xs" mb="xs">
            <IconMinus size={20} className="text-text-muted" />
            <Text size="xl" fw={700} className="text-text-secondary">
              {noChange}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">No Change</Text>
        </Card>
        <Card withBorder p="md" className="text-center">
          <Group justify="center" gap="xs" mb="xs">
            <IconTrendingDown size={20} className="text-red-500" />
            <Text size="xl" fw={700} className="text-red-500">
              {decreased}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">Decreased</Text>
        </Card>
      </Group>

      {/* Updates Table */}
      {updates.length > 0 && (
        <Card withBorder p="md">
          <Title order={4} mb="md">Updates Made</Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Key Result</Table.Th>
                <Table.Th>Objective</Table.Th>
                <Table.Th className="text-right">Previous</Table.Th>
                <Table.Th className="text-right">New</Table.Th>
                <Table.Th className="text-right">Change</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {updates.map((update) => {
                const change = update.newValue - update.previousValue;
                const changePercent =
                  update.previousValue > 0
                    ? ((change / update.previousValue) * 100).toFixed(0)
                    : change > 0
                      ? "+∞"
                      : "0";

                return (
                  <Table.Tr key={update.keyResultId}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {update.keyResultTitle}
                      </Text>
                      {update.notes && (
                        <Text size="xs" c="dimmed" mt={2}>
                          {update.notes}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {update.objectiveTitle}
                      </Text>
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Text size="sm">{update.previousValue}</Text>
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Text size="sm" fw={500}>{update.newValue}</Text>
                    </Table.Td>
                    <Table.Td className="text-right">
                      <Badge
                        color={change > 0 ? "green" : change < 0 ? "red" : "gray"}
                        variant="light"
                      >
                        {change >= 0 ? "+" : ""}
                        {change} ({changePercent}%)
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* No updates message */}
      {updates.length === 0 && (
        <Card withBorder p="lg" className="text-center">
          <Text c="dimmed">
            No updates were made during this check-in. All Key Results were skipped.
          </Text>
        </Card>
      )}

      {/* Actions */}
      <Group justify="center" gap="md">
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          onClick={onStartOver}
        >
          Start New Check-in
        </Button>
        <Button
          variant="light"
          onClick={onContinue}
        >
          Check-in Again ({periodLabel})
        </Button>
        <Button
          component={Link}
          href={`/w/${workspaceSlug}/okrs`}
          rightSection={<IconArrowRight size={16} />}
        >
          View OKR Dashboard
        </Button>
      </Group>

      {/* Tips */}
      <Card withBorder p="md" className="bg-surface-secondary">
        <Group gap="xs" mb="sm">
          <IconCheck size={16} className="text-green-500" />
          <Text size="sm" fw={500}>Best Practices</Text>
        </Group>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            • Check-in weekly to maintain momentum and visibility
          </Text>
          <Text size="sm" c="dimmed">
            • Add notes to explain significant changes or blockers
          </Text>
          <Text size="sm" c="dimmed">
            • Review at-risk KRs with your team to course-correct early
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
