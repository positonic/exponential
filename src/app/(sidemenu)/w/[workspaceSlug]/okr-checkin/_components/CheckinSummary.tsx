"use client";

import {
  Card,
  Title,
  Text,
  Group,
  Stack,
  Badge,
  ThemeIcon,
  SimpleGrid,
} from "@mantine/core";
import {
  IconCheck,
  IconClock,
  IconUsers,
  IconClipboardList,
} from "@tabler/icons-react";

interface AgendaItem {
  id: string;
  title: string;
  type: string;
  durationMinutes: number;
  isCompleted: boolean;
  notes: string | null;
}

interface StatusUpdate {
  id: string;
  isSubmitted: boolean;
  user: {
    id: string;
    name: string | null;
  };
}

interface Checkin {
  id: string;
  status: string;
  weekStartDate: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMinutes: number | null;
  notes: string | null;
  agendaItems: AgendaItem[];
  statusUpdates: StatusUpdate[];
  facilitator: {
    id: string;
    name: string | null;
    image: string | null;
  };
  team?: {
    id: string;
    name: string;
    members: { user: { id: string; name: string | null } }[];
  } | null;
}

interface CheckinSummaryProps {
  checkin: Checkin;
}

export function CheckinSummary({ checkin }: CheckinSummaryProps) {
  const submittedCount = checkin.statusUpdates.filter((u) => u.isSubmitted).length;
  const totalMembers = checkin.team?.members.length ?? 0;
  const completedAgendaItems = checkin.agendaItems.filter((i) => i.isCompleted).length;
  const totalAgendaItems = checkin.agendaItems.length;

  const isCompleted = checkin.status === "COMPLETED";

  return (
    <Stack gap="lg">
      {/* Summary Stats */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Card withBorder p="md">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="light" color="green">
              <IconCheck size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Status</Text>
              <Badge color={isCompleted ? "green" : "blue"} variant="light">
                {isCompleted ? "Completed" : "In Progress"}
              </Badge>
            </div>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="light" color="blue">
              <IconClock size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Duration</Text>
              <Text fw={600}>
                {checkin.durationMinutes ? `${checkin.durationMinutes} min` : "—"}
              </Text>
            </div>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="light" color="violet">
              <IconUsers size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Participation</Text>
              <Text fw={600}>
                {submittedCount} / {totalMembers}
              </Text>
            </div>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="light" color="orange">
              <IconClipboardList size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Agenda Items</Text>
              <Text fw={600}>
                {completedAgendaItems} / {totalAgendaItems}
              </Text>
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Meeting Details */}
      <Card withBorder p="md">
        <Title order={4} mb="md">Meeting Details</Title>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Week of</Text>
            <Text size="sm">{new Date(checkin.weekStartDate).toLocaleDateString()}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Facilitator</Text>
            <Text size="sm">{checkin.facilitator.name ?? "Unknown"}</Text>
          </Group>
          {checkin.startedAt && (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Started</Text>
              <Text size="sm">{new Date(checkin.startedAt).toLocaleString()}</Text>
            </Group>
          )}
          {checkin.completedAt && (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Completed</Text>
              <Text size="sm">{new Date(checkin.completedAt).toLocaleString()}</Text>
            </Group>
          )}
        </Stack>
      </Card>

      {/* Meeting Notes */}
      {checkin.notes && (
        <Card withBorder p="md">
          <Title order={4} mb="md">Meeting Notes</Title>
          <Text className="whitespace-pre-wrap">{checkin.notes}</Text>
        </Card>
      )}

      {/* Agenda Summary */}
      <Card withBorder p="md">
        <Title order={4} mb="md">Agenda Summary</Title>
        <Stack gap="xs">
          {checkin.agendaItems
            .sort((a, b) => {
              // Sort by order if available, otherwise by id
              const orderA = (a as AgendaItem & { order?: number }).order ?? 0;
              const orderB = (b as AgendaItem & { order?: number }).order ?? 0;
              return orderA - orderB;
            })
            .map((item) => (
              <Group key={item.id} justify="space-between" p="xs" className="rounded bg-surface-secondary">
                <Group gap="sm">
                  {item.isCompleted ? (
                    <IconCheck size={16} className="text-green-500" />
                  ) : (
                    <IconClock size={16} className="text-text-muted" />
                  )}
                  <div>
                    <Text size="sm">{item.title}</Text>
                    {item.notes && (
                      <Text size="xs" c="dimmed">{item.notes}</Text>
                    )}
                  </div>
                </Group>
                <Badge variant="light" color={item.isCompleted ? "green" : "gray"}>
                  {item.durationMinutes}m
                </Badge>
              </Group>
            ))}
        </Stack>
      </Card>

      {/* Participant Updates */}
      <Card withBorder p="md">
        <Title order={4} mb="md">Team Updates</Title>
        <Stack gap="sm">
          {checkin.statusUpdates
            .filter((u) => u.isSubmitted)
            .map((update) => (
              <Group key={update.id} justify="space-between" p="xs" className="rounded bg-surface-secondary">
                <Text size="sm">{update.user.name ?? "Unknown"}</Text>
                <Badge color="green" variant="light" size="sm">
                  Submitted
                </Badge>
              </Group>
            ))}
          {checkin.team?.members
            .filter((m) => !checkin.statusUpdates.some((u) => u.user.id === m.user.id && u.isSubmitted))
            .map((member) => (
              <Group key={member.user.id} justify="space-between" p="xs" className="rounded bg-surface-secondary">
                <Text size="sm" c="dimmed">{member.user.name ?? "Unknown"}</Text>
                <Badge color="gray" variant="light" size="sm">
                  No update
                </Badge>
              </Group>
            ))}
        </Stack>
      </Card>
    </Stack>
  );
}
