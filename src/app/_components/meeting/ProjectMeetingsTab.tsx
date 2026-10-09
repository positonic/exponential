"use client";

import { useMemo, useState } from "react";
import { Button, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendarPlus, IconMicrophone } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { ScheduleMeetingModal } from "../calendar/ScheduleMeetingModal";
import type { PendingParticipant } from "./ParticipantPicker";
import { CreateTranscriptionModal } from "../CreateTranscriptionModal";
import { ProjectFirefliesSyncPanel } from "../ProjectFirefliesSyncPanel";
import { MeetingCardList } from "./MeetingCardList";
import { ProjectOccurrenceRows } from "./ProjectOccurrenceRows";

interface ProjectMeetingsTabProps {
  projectId: string;
  projectName: string;
  workspaceId: string | null;
  hasFirefliesWorkflow: boolean;
  /** The project's DRI, preselected (with the project's members) when scheduling. */
  dri?: { id: string; name: string | null; email: string | null } | null;
}

/**
 * A project's Meetings tab: one list, newest first within each half — the
 * meetings scheduled for the project and the ceremonies that review it
 * (upcoming, not captured, cancelled; each opens its agenda), then the same
 * day-grouped recording cards as the workspace Meetings page, narrowed to
 * this project. Each card opens the full `/recording/[id]` detail page.
 */
export function ProjectMeetingsTab({
  projectId,
  projectName,
  workspaceId,
  hasFirefliesWorkflow,
  dri,
}: ProjectMeetingsTabProps) {
  const utils = api.useUtils();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { data: session } = useSession();
  // workspaceId rides along so the create modal's workspace-keyed
  // invalidation also refreshes this list.
  const { data: meetings, isLoading } = api.transcription.getMeetingCards.useQuery({
    projectId,
    workspaceId: workspaceId ?? undefined,
  });
  const { data: assignableProjects = [] } = api.project.getAssignable.useQuery();
  const { data: occurrences = [] } = api.ceremony.listOccurrencesForProject.useQuery({ projectId });

  // Scheduling is for non-viewer workspace members; the roster query refuses
  // anyone else, which is also what hides the button from them.
  const { data: schedulableMembers, isSuccess: canSchedule } =
    api.workspaceScheduling.listSchedulableMembers.useQuery(
      { workspaceId: workspaceId ?? "" },
      { enabled: !!workspaceId, retry: false },
    );
  const { data: projectMembers, isSuccess: membersLoaded } = api.project.listMembers.useQuery({ projectId });

  // The DRI and the project's members, as attendees — only those who are
  // workspace members with an email (an invite needs one, and booking
  // refuses a member attendee from outside the workspace). The organizer is
  // always invited, so they aren't listed.
  const defaultAttendees = useMemo<PendingParticipant[]>(() => {
    const schedulable = new Set((schedulableMembers ?? []).map((m) => m.id));
    const people = [dri, ...(projectMembers ?? []).map((m) => m.user)];
    const byId = new Map<string, PendingParticipant>();
    for (const person of people) {
      if (!person?.email || !schedulable.has(person.id) || person.id === session?.user?.id) continue;
      byId.set(person.id, {
        key: `user:${person.id}`,
        name: person.name ?? person.email,
        email: person.email,
        kind: "member",
        payload: { userId: person.id },
      });
    }
    return [...byId.values()];
  }, [dri, projectMembers, schedulableMembers, session?.user?.id]);

  const refresh = () => {
    void utils.transcription.getMeetingCards.invalidate();
    void utils.project.getById.invalidate();
  };

  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Project Assigned",
        message: "Meeting placement updated",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to assign project",
        color: "red",
      });
    },
    onSettled: refresh,
  });

  const processTranscriptionMutation = api.transcription.processTranscription.useMutation({
    onSuccess: (result) => {
      notifications.show(
        result.actionsCreated === 0
          ? {
              title: "No Actions Found",
              message: "This meeting summary does not contain any action items to extract",
              color: "yellow",
            }
          : {
              title: "Actions Created",
              message: `Created ${result.actionsCreated} action${result.actionsCreated === 1 ? "" : "s"} from this meeting`,
              color: "green",
            },
      );
      refresh();
    },
    onError: (error) => {
      notifications.show({
        title: "Processing Failed",
        message: error.message || "Failed to create actions",
        color: "red",
      });
    },
  });

  const archiveMutation = api.transcription.archiveTranscription.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Meeting Archived",
        message: "Meeting has been moved to archive",
        color: "green",
      });
      refresh();
    },
    onError: (error) => {
      notifications.show({
        title: "Archive Failed",
        message: error.message || "Failed to archive meeting",
        color: "red",
      });
    },
  });

  const deleteMutation = api.transcription.bulkDeleteTranscriptions.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Meeting Deleted",
        message: "Meeting has been deleted",
        color: "green",
      });
      refresh();
    },
    onError: (error) => {
      notifications.show({
        title: "Delete Failed",
        message: error.message || "Failed to delete meeting",
        color: "red",
      });
    },
  });

  const count = meetings?.length ?? 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="md">
          <Title order={4}>Project Meetings</Title>
          <CreateTranscriptionModal
            projectId={projectId}
            projectName={projectName}
            workspaceId={workspaceId ?? undefined}
          />
          {/* Waits for the member list too: the modal takes its preselected
              attendees once, when it opens. */}
          {workspaceId && canSchedule && membersLoaded && (
            <Button
              variant="light"
              leftSection={<IconCalendarPlus size={16} />}
              onClick={() => setScheduleOpen(true)}
            >
              Schedule meeting
            </Button>
          )}
        </Group>
        <Group gap="md">
          {hasFirefliesWorkflow && (
            <ProjectFirefliesSyncPanel projectId={projectId} onSyncComplete={refresh} />
          )}
          <Text size="sm" c="dimmed">
            {count} meeting{count === 1 ? "" : "s"}
          </Text>
        </Group>
      </Group>

      {workspaceId && (
        <ScheduleMeetingModal
          opened={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          defaultWorkspaceId={workspaceId}
          projectId={projectId}
          defaultAttendees={defaultAttendees}
          onCreated={() => void utils.ceremony.listOccurrencesForProject.invalidate({ projectId })}
        />
      )}

      <ProjectOccurrenceRows rows={occurrences} />

      {isLoading ? (
        <Stack gap="sm">
          <Skeleton height={72} radius="md" />
          <Skeleton height={72} radius="md" />
          <Skeleton height={72} radius="md" />
        </Stack>
      ) : meetings && meetings.length > 0 ? (
        <MeetingCardList
          meetings={meetings}
          assignableProjects={assignableProjects}
          onProjectChange={(transcriptionId, nextProjectId) =>
            assignProjectMutation.mutate({ transcriptionId, projectId: nextProjectId })
          }
          onExtractActions={(session) =>
            processTranscriptionMutation.mutate({ transcriptionId: session.id })
          }
          onArchive={(session) => archiveMutation.mutate({ id: session.id })}
          onDelete={(session) => {
            if (confirm("Are you sure you want to delete this meeting?")) {
              deleteMutation.mutate({ ids: [session.id] });
            }
          }}
        />
      ) : occurrences.length > 0 ? null : (
        <Paper p="xl" radius="md" className="text-center">
          <Stack gap="md" align="center">
            <IconMicrophone size={40} opacity={0.3} />
            <Text size="md" c="dimmed">No meetings found</Text>
            <Text size="sm" c="dimmed">
              Meetings assigned to this project will appear here
            </Text>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
