"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconCalendarRepeat, IconSettings } from "@tabler/icons-react";
import type { CeremonyOccurrenceStatus } from "@prisma/client";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { describeCadence } from "~/lib/ceremonies/cadence";
import { CEREMONY_KIND_LABELS } from "~/app/_components/ceremonies/CeremonyEditorModal";

/**
 * Ceremony page (ADR-0059, V1 minimal): the definition summary and the
 * occurrence list with the recordings that captured each one. V2 adds the
 * per-occurrence page with the generated agenda.
 */

const STATUS_COLOR: Record<CeremonyOccurrenceStatus, string> = {
  PLANNED: "gray",
  AGENDA_CIRCULATED: "blue",
  IN_PROGRESS: "indigo",
  CAPTURED: "green",
  FOLLOWED_THROUGH: "teal",
  SKIPPED: "orange",
};

const STATUS_LABEL: Record<CeremonyOccurrenceStatus, string> = {
  PLANNED: "Planned",
  AGENDA_CIRCULATED: "Agenda circulated",
  IN_PROGRESS: "In progress",
  CAPTURED: "Captured",
  FOLLOWED_THROUGH: "Followed through",
  SKIPPED: "Skipped",
};

const whenFmt: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function ProseBlock({ title, content }: { title: string; content: string | null }) {
  if (!content) return null;
  return (
    <div>
      <Text size="xs" fw={600} tt="uppercase" className="text-text-muted" mb={4}>
        {title}
      </Text>
      <MarkdownRenderer content={content} variant="compact" />
    </div>
  );
}

export default function CeremonyPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();
  const params = useParams<{ ceremonyId: string; workspaceSlug: string }>();

  const { data: ceremony, isLoading: ceremonyLoading, error } = api.ceremony.get.useQuery(
    { workspaceId: workspaceId ?? "", id: params.ceremonyId },
    { enabled: !!workspaceId },
  );

  if (isLoading || !workspace || (ceremonyLoading && !ceremony)) {
    return (
      <Container size="lg" py="xl">
        <Skeleton height={32} width={280} mb="md" />
        <Skeleton height={200} />
      </Container>
    );
  }

  if (error || !ceremony) {
    return (
      <Container size="lg" py="xl">
        <Text className="text-text-muted">{error?.message ?? "Ceremony not found."}</Text>
      </Container>
    );
  }

  const now = Date.now();
  const upcoming = ceremony.occurrences.filter((o) => new Date(o.scheduledStart).getTime() >= now).reverse();
  const past = ceremony.occurrences.filter((o) => new Date(o.scheduledStart).getTime() < now);
  const participantNames = ceremony.participants.map((p) => p.user.name ?? p.user.email ?? p.userId);

  const renderRows = (rows: typeof ceremony.occurrences) =>
    rows.map((o) => (
      <Table.Tr key={o.id} data-testid={`occurrence-row-${o.id}`}>
        <Table.Td>
          <Text size="sm">{new Date(o.scheduledStart).toLocaleString(undefined, whenFmt)}</Text>
        </Table.Td>
        <Table.Td>
          <Badge size="sm" variant="light" color={STATUS_COLOR[o.status]}>
            {STATUS_LABEL[o.status]}
          </Badge>
          {o.skipReason && (
            <Text size="xs" className="text-text-muted">
              {o.skipReason}
            </Text>
          )}
        </Table.Td>
        <Table.Td>
          {o.recordedMeetings.length === 0 ? (
            <Text size="xs" className="text-text-muted">
              —
            </Text>
          ) : (
            <Stack gap={2}>
              {o.recordedMeetings.map((m) =>
                m.title !== null || m.meetingDate !== null ? (
                  <Link key={m.id} href={`/recording/${m.id}`} className="text-sm hover:underline">
                    {m.title ?? "Untitled meeting"}
                  </Link>
                ) : (
                  <Text key={m.id} size="xs" className="text-text-muted">
                    A recording you can&apos;t view
                  </Text>
                ),
              )}
            </Stack>
          )}
        </Table.Td>
      </Table.Tr>
    ));

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Button
              component={Link}
              href={`/w/${workspace.slug}/settings/ceremonies`}
              variant="subtle"
              size="compact-sm"
              leftSection={<IconArrowLeft size={14} />}
              px={0}
            >
              All ceremonies
            </Button>
            <Group gap="xs" mt={6}>
              <IconCalendarRepeat size={22} />
              <Title order={2}>{ceremony.name}</Title>
              <Badge variant="light">{CEREMONY_KIND_LABELS[ceremony.kind]}</Badge>
              {!ceremony.isActive && (
                <Badge variant="outline" color="gray">
                  Inactive
                </Badge>
              )}
            </Group>
            <Text size="sm" className="text-text-muted" mt={4}>
              {describeCadence(ceremony.cadenceRule)} · {ceremony.timezone} · {ceremony.durationMinutes} min
            </Text>
          </div>
          <Button
            component={Link}
            href={`/w/${workspace.slug}/settings/ceremonies`}
            variant="default"
            size="sm"
            leftSection={<IconSettings size={14} />}
          >
            Edit in settings
          </Button>
        </Group>

        <Paper withBorder radius="md" p="lg">
          <Stack gap="md">
            <Group gap="xl" wrap="wrap">
              <div>
                <Text size="xs" fw={600} tt="uppercase" className="text-text-muted">
                  Owner
                </Text>
                <Text size="sm">{ceremony.owner.name ?? ceremony.owner.email ?? "—"}</Text>
              </div>
              <div>
                <Text size="xs" fw={600} tt="uppercase" className="text-text-muted">
                  Participants
                </Text>
                <Text size="sm">
                  {participantNames.length > 0 ? participantNames.join(", ") : "—"}
                  {ceremony.team ? ` · everyone on ${ceremony.team.name}` : ""}
                </Text>
              </div>
              {(ceremony.product ?? ceremony.project) && (
                <div>
                  <Text size="xs" fw={600} tt="uppercase" className="text-text-muted">
                    Scope
                  </Text>
                  <Text size="sm">{[ceremony.product?.name, ceremony.project?.name].filter(Boolean).join(" · ")}</Text>
                </div>
              )}
              {ceremony.aliases.length > 0 && (
                <div>
                  <Text size="xs" fw={600} tt="uppercase" className="text-text-muted">
                    Aliases
                  </Text>
                  <Text size="sm">{ceremony.aliases.join(", ")}</Text>
                </div>
              )}
            </Group>
            {[ceremony.purpose, ceremony.notFor, ceremony.inputs, ceremony.outputs].some(Boolean) && <Divider />}
            <ProseBlock title="Purpose" content={ceremony.purpose} />
            <ProseBlock title="Not for" content={ceremony.notFor} />
            <Group grow align="flex-start">
              <ProseBlock title="Inputs" content={ceremony.inputs} />
              <ProseBlock title="Outputs" content={ceremony.outputs} />
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p={0}>
          <Group justify="space-between" px="lg" py="sm">
            <Title order={4}>Occurrences</Title>
            <Text size="xs" className="text-text-muted">
              {upcoming.length} upcoming · {past.length} past
            </Text>
          </Group>
          {ceremony.occurrences.length === 0 ? (
            <Text size="sm" className="text-text-muted" px="lg" pb="lg">
              No occurrences yet. They are generated hourly from the cadence.
            </Text>
          ) : (
            <Table verticalSpacing="sm" data-testid="occurrences-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>When</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Recordings</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {renderRows(upcoming)}
                {upcoming.length > 0 && past.length > 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text size="xs" className="text-text-muted">
                        Past
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {renderRows(past)}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
