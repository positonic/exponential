"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Container, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconBrandMatrix, IconCalendarX, IconSend, IconSparkles } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { AgendaView } from "~/app/_components/ceremonies/AgendaView";
import { OccurrenceUpdatePanel } from "~/app/_components/ceremonies/OccurrenceUpdatePanel";
import { OccurrenceAsyncSummary } from "~/app/_components/ceremonies/OccurrenceAsyncSummary";
import { OccurrenceSkipBanner } from "~/app/_components/ceremonies/OccurrenceSkipBanner";
import { OccurrenceNotes } from "~/app/_components/ceremonies/OccurrenceNotes";
import { useRegisterTopbarCrumbs } from "~/app/_components/layout/TopbarCrumbs";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

/**
 * Occurrence page (ADR-0059): the generated agenda for one ceremony
 * occurrence — sections and items from the section queries, regenerable on
 * demand by the ceremony owner — plus the participant's own async-first
 * update (V3), the empty-agenda skip proposal and the recordings that
 * captured it.
 *
 * A one-off (a meeting booked from a project, ADR-0059 amendment 2026-10-07)
 * reads as a meeting: its purpose under the title, its attendees, Cancel for
 * the organizer, and "Meeting" — never "Ceremony" — in the crumb. The route
 * stays under /ceremonies.
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
        title: res.circulated ? "Agenda generated and sent" : "Agenda generated",
        message: `${res.itemCount} item${res.itemCount === 1 ? "" : "s"} across ${res.agenda.sections.length} sections${res.circulated ? "; participants notified" : ""}.`,
        color: "green",
      });
      await utils.ceremony.getOccurrence.invalidate({ workspaceId: workspaceId ?? "", occurrenceId: params.occurrenceId });
    },
    onError: (e) => notifications.show({ title: "Couldn't generate agenda", message: e.message, color: "red" }),
  });

  const invalidate = () =>
    utils.ceremony.getOccurrence.invalidate({ workspaceId: workspaceId ?? "", occurrenceId: params.occurrenceId });
  const addItem = api.ceremony.addAgendaItem.useMutation({
    onSuccess: invalidate,
    onError: (e) => notifications.show({ title: "Couldn't add item", message: e.message, color: "red" }),
  });
  const reorder = api.ceremony.reorderAgendaItems.useMutation({
    onSuccess: invalidate,
    onError: (e) => notifications.show({ title: "Couldn't reorder", message: e.message, color: "red" }),
  });
  const postToMatrix = api.ceremony.postAgendaToMatrix.useMutation({
    onSuccess: async (res) => {
      if (res.kind === "posted") notifications.show({ title: "Agenda posted to Matrix", message: res.roomId, color: "green" });
      else if (res.kind === "already-posted") {
        notifications.show({ title: "Already posted", message: `Posted ${new Date(res.postedAt).toLocaleString()}. Post again to send a second copy.`, color: "yellow" });
      } else notifications.show({ title: "Not posted", message: "reason" in res ? res.reason : res.kind.replace(/-/g, " "), color: "red" });
      await invalidate();
    },
    onError: (e) => notifications.show({ title: "Couldn't post to Matrix", message: e.message, color: "red" }),
  });
  const { data: session } = useSession();
  const isOneOff = occurrence?.isOneOff ?? false;
  useRegisterTopbarCrumbs(isOneOff && occurrence ? [{ label: occurrence.ceremony.name }] : null, {
    level: 1,
    section: { label: "Meetings", href: `/w/${params.workspaceSlug}/meetings` },
  });

  const cancelMeeting = api.workspaceScheduling.cancelMeeting.useMutation({
    onSuccess: async (res) => {
      notifications.show({
        title: "Meeting cancelled",
        message: `${res.invitesSent} cancellation${res.invitesSent === 1 ? "" : "s"} sent to attendees' calendars.`,
        color: "blue",
      });
      await Promise.all([invalidate(), utils.workspaceScheduling.listMeetings.invalidate()]);
    },
    onError: (e) => notifications.show({ title: "Couldn't cancel", message: e.message, color: "red" }),
  });
  const confirmCancel = (meetingId: string, title: string) => {
    if (!workspaceId) return;
    modals.openConfirmModal({
      title: "Cancel meeting?",
      children: (
        <Text size="sm">
          Attendees will receive a cancellation that removes “{title}” from their calendars. The agenda and
          notes stay here. Rescheduling means booking a new meeting.
        </Text>
      ),
      labels: { confirm: "Cancel meeting", cancel: "Keep meeting" },
      confirmProps: { color: "red" },
      onConfirm: () => cancelMeeting.mutate({ workspaceId, meetingId }),
    });
  };

  const resolveItem = api.ceremony.resolveAgendaItem.useMutation({
    onSuccess: async () => {
      await utils.ceremony.getOccurrence.invalidate({ workspaceId: workspaceId ?? "", occurrenceId: params.occurrenceId });
    },
    onError: (e) => notifications.show({ title: "Couldn't update item", message: e.message, color: "red" }),
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
  const booking = occurrence.scheduledMeeting;
  const canCancel =
    isOneOff && booking?.status === "confirmed" && booking.organizerId === session?.user?.id;
  const attendeeNames = (booking?.attendees ?? []).map((a) => a.name).filter((n): n is string => !!n);
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            {/* A one-off has no series to go back to; the topbar crumb leads to Meetings. */}
            {!isOneOff && (
              <Button
                component={Link}
                href={`/w/${workspace.slug}/ceremonies/${occurrence.ceremony.id}`}
                variant="subtle"
                size="compact-sm"
                leftSection={<IconArrowLeft size={14} />}
                px={0}
                mb={6}
              >
                {occurrence.ceremony.name}
              </Button>
            )}
            <Title order={2}>
              {occurrence.ceremony.name} · {when}
            </Title>
            {isOneOff && occurrence.purpose && (
              <div className="mt-1 text-text-secondary" data-testid="meeting-purpose">
                <MarkdownRenderer content={occurrence.purpose} variant="compact" />
              </div>
            )}
            <Group gap="xs" mt={6}>
              <Badge variant="light">
                {isOneOff && booking?.status === "cancelled" ? "cancelled" : occurrence.status.replace(/_/g, " ").toLowerCase()}
              </Badge>
              <Text size="sm" className="text-text-muted">
                {occurrence.ceremony.durationMinutes} min · {isOneOff ? "organizer" : "owner"}{" "}
                {occurrence.ceremony.owner.name ?? occurrence.ceremony.owner.email ?? "—"}
                {isOneOff && attendeeNames.length > 0 ? ` · with ${attendeeNames.join(", ")}` : ""}
              </Text>
              {occurrence.agendaGeneratedAt && (
                <Text size="xs" className="text-text-muted">
                  agenda generated {new Date(occurrence.agendaGeneratedAt).toLocaleString()}
                  {occurrence.agendaCirculatedAt ? ` · circulated ${new Date(occurrence.agendaCirculatedAt).toLocaleString()}` : ""}
                </Text>
              )}
            </Group>
          </div>
          {occurrence.canGenerate && occurrence.status !== "SKIPPED" && (
            <Group gap="xs">
              {canCancel && booking && (
                <Button
                  variant="default"
                  color="red"
                  leftSection={<IconCalendarX size={14} />}
                  loading={cancelMeeting.isPending}
                  onClick={() => confirmCancel(booking.id, occurrence.ceremony.name)}
                  data-testid="cancel-meeting"
                >
                  Cancel meeting
                </Button>
              )}
              <Button
                variant="default"
                leftSection={<IconSparkles size={14} />}
                loading={generate.isPending && !generate.variables?.circulate}
                onClick={() => generate.mutate({ workspaceId, occurrenceId: occurrence.id })}
                data-testid="generate-agenda"
              >
                {occurrence.agenda ? "Regenerate agenda" : "Generate agenda"}
              </Button>
              {occurrence.ceremony.matrixRoomId && occurrence.agenda && (
                <Button
                  variant="default"
                  leftSection={<IconBrandMatrix size={14} />}
                  loading={postToMatrix.isPending}
                  onClick={() => postToMatrix.mutate({ workspaceId, occurrenceId: occurrence.id, confirmRepost: postToMatrix.data?.kind === "already-posted" })}
                  data-testid="post-agenda-matrix"
                >
                  Post to Matrix
                </Button>
              )}
              <Button
                leftSection={<IconSend size={14} />}
                loading={generate.isPending && Boolean(generate.variables?.circulate)}
                onClick={() => generate.mutate({ workspaceId, occurrenceId: occurrence.id, circulate: true })}
                data-testid="circulate-agenda"
              >
                {occurrence.agendaCirculatedAt
                  ? "Regenerate & resend"
                  : `Generate & send to ${isOneOff ? "attendees" : "participants"}`}
              </Button>
            </Group>
          )}
        </Group>

        <OccurrenceSkipBanner
          workspaceId={workspaceId}
          occurrenceId={occurrence.id}
          status={occurrence.status}
          skipReason={occurrence.skipReason}
          proposed={occurrence.skipProposal.proposed}
          canManage={occurrence.canGenerate}
          onChanged={invalidate}
          cancelledMeeting={isOneOff && booking?.status === "cancelled"}
        />

        <OccurrenceUpdatePanel workspaceId={workspaceId} occurrenceId={occurrence.id} />

        <OccurrenceAsyncSummary workspaceId={workspaceId} occurrenceId={occurrence.id} />

        {occurrence.agenda ? (
          <AgendaView
            agenda={occurrence.agenda}
            goalsHref={`/w/${workspace.slug}/goals?tab=okrs`}
            onToggleResolved={(itemId, resolved) =>
              resolveItem.mutate({ workspaceId, occurrenceId: occurrence.id, itemId, resolved })
            }
            onAddItem={(sectionKey, title) => addItem.mutate({ workspaceId, occurrenceId: occurrence.id, sectionKey, title })}
            onReorder={(sectionKey, itemIds) => reorder.mutate({ workspaceId, occurrenceId: occurrence.id, sectionKey, itemIds })}
            narrativeHint={
              occurrence.notesPageId
                ? "This pre-read is a snapshot. The editable copy lives in the notes page below, under \"Draft agenda\"."
                : undefined
            }
          />
        ) : (
          <Paper withBorder radius="md" p="lg">
            <Text size="sm" className="text-text-muted">
              No agenda yet. It is generated {occurrence.ceremony.leadTimeHours} hours before the start
              {occurrence.canGenerate ? ", or now with the button above." : "."}
            </Text>
          </Paper>
        )}

        {/* The notes canvas is created with the first agenda; until then
            there is nothing to link to. A skipped occurrence keeps its notes
            readable but frozen. */}
        {occurrence.notesPageId && (
          <OccurrenceNotes
            pageId={occurrence.notesPageId}
            workspaceSlug={workspace.slug}
            readOnly={occurrence.status === "SKIPPED"}
          />
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
                m.visible ? (
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
