"use client";

import {
  Avatar,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";
import { formatMinutes } from "~/app/_components/metrics/format";

/** Hours logged on the project's Actions — in total and per person. */
export function ProjectTimeTab({ projectId }: { projectId: string }) {
  const { data: report, isLoading, error } = api.timeEntry.projectSummary.useQuery({ projectId });

  if (isLoading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (error || !report) {
    return (
      <Paper p="xl" radius="md" withBorder className="border-border-primary bg-surface-secondary">
        <Text size="sm" c="dimmed" ta="center">
          Time for this project is only visible to its members.
        </Text>
      </Paper>
    );
  }

  const hasAnyTime = report.people.length > 0 || report.agentRunMinutes > 0;

  if (!hasAnyTime) {
    return (
      <Paper p="xl" radius="md" withBorder className="border-border-primary bg-surface-secondary">
        <Stack align="center" gap="xs">
          <IconClock size={20} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-primary">
            No time logged yet
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            Time tracked on this project&apos;s tasks will show up here, broken down by person.
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <StatCard label="Total logged" value={formatMinutes(report.confirmedMinutes)} />
        <StatCard label="People" value={String(report.people.length)} />
        {report.proposedMinutes > 0 && (
          <StatCard
            label="Awaiting confirmation"
            value={formatMinutes(report.proposedMinutes)}
            hint="Proposed time from the daily worklog that hasn't been confirmed yet. Not included in the total."
          />
        )}
        {report.agentRunMinutes > 0 && (
          <StatCard
            label="Agent-run"
            value={formatMinutes(report.agentRunMinutes)}
            hint="Time agents spent running on this project's tasks. Not included in the total."
          />
        )}
      </SimpleGrid>

      <Paper radius="md" withBorder className="border-border-primary bg-surface-secondary">
        <Group
          justify="space-between"
          px="md"
          py="sm"
          style={{ borderBottom: "1px solid var(--color-border-primary)" }}
        >
          <Text size="sm" fw={600} className="text-text-primary">
            By person
          </Text>
          <Text size="xs" c="dimmed">
            {report.entryCount} {report.entryCount === 1 ? "entry" : "entries"}
          </Text>
        </Group>

        <Stack gap={0}>
          {report.people.map((person) => {
            const displayName = person.name ?? "Unnamed";
            const share =
              report.confirmedMinutes > 0
                ? Math.round((person.confirmedMinutes / report.confirmedMinutes) * 100)
                : 0;
            return (
              <Group
                key={person.userId}
                px="md"
                py="sm"
                wrap="nowrap"
                gap="md"
                style={{ borderTop: "1px solid var(--color-border-subtle)" }}
              >
                <Avatar src={person.image} radius="xl" size="sm">
                  {displayName.charAt(0).toUpperCase()}
                </Avatar>
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" fw={500} className="text-text-primary" truncate>
                      {displayName}
                    </Text>
                    <Text size="sm" fw={600} className="text-text-primary" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMinutes(person.confirmedMinutes)}
                    </Text>
                  </Group>
                  <Progress value={share} size="xs" radius="xl" aria-label={`${share}% of total`} />
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="xs" c="dimmed" truncate>
                      {person.lastLoggedAt
                        ? `${person.entryCount} ${person.entryCount === 1 ? "entry" : "entries"} · last logged ${formatDistanceToNow(new Date(person.lastLoggedAt), { addSuffix: true })}`
                        : "No confirmed time yet"}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {person.proposedMinutes > 0
                        ? `+${formatMinutes(person.proposedMinutes)} proposed · ${share}%`
                        : `${share}%`}
                    </Text>
                  </Group>
                </Stack>
              </Group>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const card = (
    <Paper p="md" radius="md" withBorder className="border-border-primary bg-surface-secondary">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed" style={{ letterSpacing: "0.04em" }}>
        {label}
      </Text>
      <Text size="xl" fw={600} className="text-text-primary" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
    </Paper>
  );
  return hint ? (
    <Tooltip label={hint} multiline w={260} withArrow>
      {card}
    </Tooltip>
  ) : (
    card
  );
}
