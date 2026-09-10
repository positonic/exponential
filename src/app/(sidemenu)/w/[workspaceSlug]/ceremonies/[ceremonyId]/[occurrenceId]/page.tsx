"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Container, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconSparkles } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { AgendaView } from "~/app/_components/ceremonies/AgendaView";

/**
 * Occurrence page (ADR-0059, V2): the generated agenda for one ceremony
 * occurrence — sections and items from the section queries, regenerable on
 * demand by the ceremony owner — plus the recordings that captured it.
 */

const whenFmt: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default function OccurrencePage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();
  const params = useParams<{ ceremonyId: string; occurrenceId: string; workspaceSlug: string }>();
  const utils = api.useUtils();

  const { data: occurrence, isLoading: occLoading, error } = api.ceremony.getOccurrence.useQuery(
    { workspaceId: workspaceId ?? "", occurrenceId: params.occurrenceId },
    { enabled: !!workspaceId },
  );
  const generate = api.ceremony.generateAgenda.useMutation({
    onSuccess: async (res) => {
      notifications.show({
        title: "Agenda generated",
        message: `${res.itemCount} item${res.itemCount === 1 ? "" : "s"} across ${res.agenda.sections.length} sections.`,
        color: "green",
      });
      await utils.ceremony.getOccurrence.invalidate({ workspaceId: workspaceId ?? "", occurrenceId: params.occurrenceId });
    },
    onError: (e) => notifications.show({ title: "Couldn't generate agenda", message: e.message, color: "red" }),
  });

  if (isLoading || !workspace || !workspaceId || (occLoading && !occurrence)) {
    return (
      <Container size="lg" py="xl">
        <Skeleton height={32} width={320} mb="md" />
        <Skeleton height={240} />
      </Container>
    );
  }
  if (error || !occurrence) {
    return (
      <Container size="lg" py="xl">
        <Text className="text-text-muted">{error?.message ?? "Occurrence not found."}</Text>
      </Container>
    );
  }

  const when = new Date(occurrence.scheduledStart).toLocaleString(undefined, whenFmt);
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Button
              component={Link}
              href={`/w/${workspace.slug}/ceremonies/${occurrence.ceremony.id}`}
              variant="subtle"
              size="compact-sm"
              leftSection={<IconArrowLeft size={14} />}
              px={0}
            >
              {occurrence.ceremony.name}
            </Button>
            <Title order={2} mt={6}>
              {occurrence.ceremony.name} · {when}
            </Title>
            <Group gap="xs" mt={6}>
              <Badge variant="light">{occurrence.status.replace(/_/g, " ").toLowerCase()}</Badge>
              <Text size="sm" className="text-text-muted">
                {occurrence.ceremony.durationMinutes} min · owner {occurrence.ceremony.owner.name ?? occurrence.ceremony.owner.email ?? "—"}
              </Text>
              {occurrence.agendaGeneratedAt && (
                <Text size="xs" className="text-text-muted">
                  agenda generated {new Date(occurrence.agendaGeneratedAt).toLocaleString()}
                </Text>
              )}
            </Group>
          </div>
          {occurrence.canGenerate && (
            <Button
              leftSection={<IconSparkles size={14} />}
              loading={generate.isPending}
              onClick={() => generate.mutate({ workspaceId, occurrenceId: occurrence.id })}
              data-testid="generate-agenda"
            >
              {occurrence.agenda ? "Regenerate agenda" : "Generate agenda"}
            </Button>
          )}
        </Group>

        {occurrence.agenda ? (
          <AgendaView agenda={occurrence.agenda} />
        ) : (
          <Paper withBorder radius="md" p="lg">
            <Text size="sm" className="text-text-muted">
              No agenda yet. It is generated {occurrence.ceremony.leadTimeHours} hours before the start
              {occurrence.canGenerate ? ", or now with the button above." : "."}
            </Text>
          </Paper>
        )}

        <Paper withBorder radius="md" p="lg">
          <Text fw={600} mb={6}>
            Recordings
          </Text>
          {occurrence.recordedMeetings.length === 0 ? (
            <Text size="sm" className="text-text-muted">
              No recording attached yet.
            </Text>
          ) : (
            <Stack gap={4}>
              {occurrence.recordedMeetings.map((m) =>
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
        </Paper>
      </Stack>
    </Container>
  );
}
