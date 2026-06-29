'use client';

import { api } from "~/trpc/react";
import { Skeleton, Paper, Text } from "@mantine/core";
import { use, useEffect, useMemo, useRef } from "react";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useAgentModal, type ChatMessage } from "~/providers/AgentModalProvider";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
import { MeetingDetail } from "~/app/_components/meeting/MeetingDetail";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: session, isLoading } = api.transcription.getById.useQuery({ id });
  const { data: transcriptActions = [], isLoading: isActionsLoading } =
    api.action.getByTranscription.useQuery(
      { transcriptionId: id },
      { enabled: Boolean(id) },
    );
  const { data: assignableProjects = [] } = api.project.getAssignable.useQuery();
  const utils = api.useUtils();
  const router = useRouter();
  const updateDetailsMutation = api.transcription.updateDetails.useMutation();
  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Saved",
        message: "Meeting placement updated",
        color: "green",
      });
      void utils.transcription.getById.invalidate({ id });
      void utils.action.getByTranscription.invalidate({ transcriptionId: id });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update placement",
        color: "red",
      });
    },
  });
  const archiveMutation = api.transcription.archiveTranscription.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Archived",
        message: "Meeting moved to archive.",
        color: "green",
      });
      const slug = session?.workspace?.slug;
      router.push(slug ? `/w/${slug}/meetings` : "/recordings");
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to archive",
        color: "red",
      });
    },
  });
  const { openModal, setMessages } = useAgentModal();

  // Auto-generate the summary on view when a meeting has a transcript but no
  // summary yet, instead of waiting for the hourly cron sweep. Routes through
  // the shared `generateSummary` mutation (one summarization path). Guarded so
  // it fires at most once per meeting id, even on re-render / failure.
  const summaryAttemptedRef = useRef<Set<string>>(new Set());
  const generateSummaryMutation = api.transcription.generateSummary.useMutation({
    onSuccess: () => {
      void utils.transcription.getById.invalidate({ id });
    },
  });
  const { mutate: generateSummary } = generateSummaryMutation;

  // Manual refresh: re-run the AI summary (the mutation overwrites the stored
  // one) with explicit feedback, vs the silent auto-generate-on-view above.
  async function handleRegenerateSummary() {
    if (!session) return;
    // Don't stack a manual regenerate on top of an in-flight generation (the
    // auto-generate-on-view effect shares this mutation).
    if (generateSummaryMutation.isPending) return;
    try {
      await generateSummaryMutation.mutateAsync({ transcriptionId: session.id });
      notifications.show({
        title: "Summary regenerated",
        message: "The meeting summary has been refreshed.",
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to regenerate summary",
        color: "red",
      });
    }
  }

  useEffect(() => {
    if (!session) return;
    const hasSummary = Boolean(session.summary?.trim());
    const hasTranscript = Boolean(session.transcription);
    if (hasSummary || !hasTranscript) return;
    if (summaryAttemptedRef.current.has(session.id)) return;
    summaryAttemptedRef.current.add(session.id);
    generateSummary({ transcriptionId: session.id });
  }, [session, generateSummary]);

  // Deterministic extraction: Create Actions runs generateDraftActions (not the
  // LLM), then appends an interactive review card to the active drawer thread
  // (ADR-0007).
  const generateDraftsMutation =
    api.transcription.generateDraftActions.useMutation({
      onSuccess: (result) => {
        if (!session) return;
        if (result.alreadyPublished) {
          notifications.show({
            title: "Actions already created",
            message: "This meeting already has actions.",
            color: "orange",
          });
          return;
        }
        if (result.actionsCreated === 0 && result.draftCount === 0) {
          notifications.show({
            title: "No actions found",
            message: "No action items were detected in this meeting.",
            color: "gray",
          });
          return;
        }
        void utils.transcription.getById.invalidate({ id });
        const transcriptionId = session.id;
        setMessages((prev) => {
          const alreadyHasCard = prev.some(
            (m) =>
              m.card?.kind === "draft-actions" &&
              m.card.transcriptionId === transcriptionId,
          );
          if (alreadyHasCard) return prev;
          const cardMessage: ChatMessage = {
            type: "ai",
            agentName: "Zoe",
            content:
              "I found some actions in this meeting — review and create the ones you want below.",
            card: { kind: "draft-actions", transcriptionId },
          };
          return [...prev, cardMessage];
        });
        openModal();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to generate draft actions",
          color: "red",
        });
      },
    });

  function handleCreateActions() {
    if (!session) return;
    generateDraftsMutation.mutate({ transcriptionId: session.id });
  }

  function handleArchive() {
    if (!session) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Archive this meeting? You can restore it later.")
    )
      return;
    archiveMutation.mutate({ id: session.id });
  }

  async function handleSaveSummary(value: string) {
    if (!session) return;
    try {
      await updateDetailsMutation.mutateAsync({ id: session.id, summary: value });
      notifications.show({ title: "Saved", message: "Summary updated", color: "green" });
      void utils.transcription.getById.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update summary",
        color: "red",
      });
    }
  }

  async function handleMeetingDateChange(value: Date | null) {
    if (!session) return;
    try {
      await updateDetailsMutation.mutateAsync({ id: session.id, meetingDate: value });
      notifications.show({
        title: "Saved",
        message: value ? "Meeting date updated" : "Meeting date cleared",
        color: "green",
      });
      void utils.transcription.getById.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update meeting date",
        color: "red",
      });
    }
  }

  function handleProjectChange(projectId: string | null) {
    if (!session) return;
    // Routes through the placement service: sets the project, derives the
    // workspace, and re-homes the meeting's Actions in one path.
    assignProjectMutation.mutate({ transcriptionId: session.id, projectId });
  }

  // Register page context so the agent chat knows what recording is in view.
  const recordingPageContext = useMemo(() => {
    if (!session) return null;
    return {
      pageType: "recording" as const,
      pageTitle: session.title ?? "Meeting",
      pagePath: `/recording/${id}`,
      data: {
        transcriptionId: session.id,
        title: session.title ?? "Untitled",
        summary: session.summary ?? null,
        description: session.description ?? null,
        actionsCount: transcriptActions.length,
        hasTranscription: Boolean(session.transcription),
        meetingDate: session.meetingDate ? String(session.meetingDate) : null,
        workspaceName: session.workspace?.name ?? null,
      },
    };
  }, [session, transcriptActions.length, id]);

  useRegisterPageContext(recordingPageContext);

  if (isLoading) {
    return <Skeleton height={400} />;
  }

  if (!session) {
    return (
      <Paper p="md">
        <Text>Meeting not found</Text>
      </Paper>
    );
  }

  return (
    <MeetingDetail
      session={session}
      actions={transcriptActions}
      isActionsLoading={isActionsLoading}
      assignableProjects={assignableProjects}
      isCreatingActions={generateDraftsMutation.isPending}
      isGeneratingSummary={generateSummaryMutation.isPending}
      onSaveSummary={handleSaveSummary}
      onMeetingDateChange={handleMeetingDateChange}
      onProjectChange={handleProjectChange}
      onCreateActions={handleCreateActions}
      onRegenerateSummary={handleRegenerateSummary}
      onArchive={handleArchive}
    />
  );
}
