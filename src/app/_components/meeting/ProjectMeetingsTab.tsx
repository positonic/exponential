"use client";

import { Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMicrophone } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CreateTranscriptionModal } from "../CreateTranscriptionModal";
import { ProjectFirefliesSyncPanel } from "../ProjectFirefliesSyncPanel";
import { MeetingCardList } from "./MeetingCardList";

interface ProjectMeetingsTabProps {
  projectId: string;
  workspaceId: string | null;
  hasFirefliesWorkflow: boolean;
}

/**
 * A project's Meetings tab: the same day-grouped cards as the workspace
 * Meetings page, narrowed to this project. Each card opens the full
 * `/recording/[id]` detail page.
 */
export function ProjectMeetingsTab({
  projectId,
  workspaceId,
  hasFirefliesWorkflow,
}: ProjectMeetingsTabProps) {
  const utils = api.useUtils();
  // workspaceId rides along so the create modal's workspace-keyed
  // invalidation also refreshes this list.
  const { data: meetings, isLoading } = api.transcription.getMeetingCards.useQuery({
    projectId,
    workspaceId: workspaceId ?? undefined,
  });
  const { data: assignableProjects = [] } = api.project.getAssignable.useQuery();

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
            workspaceId={workspaceId ?? undefined}
          />
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
      ) : (
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
