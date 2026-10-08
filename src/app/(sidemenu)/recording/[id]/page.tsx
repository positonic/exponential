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

  const { data: session, isLoading } = api.transcription.getDetail.useQuery({ id });
  const { data: transcriptActions = [], isLoading: isActionsLoading } =
    api.action.getByTranscription.useQuery(
      { transcriptionId: id },
      { enabled: Boolean(id) },
    );
  const utils = api.useUtils();
  // Decisions only need the meeting id, which the URL already carries: start
  // them alongside the meeting instead of after it. MeetingDetail reads the
  // same cache entry.
  useEffect(() => {
    void utils.decision.listForMeeting.prefetch({ transcriptionSessionId: id });
  }, [utils, id]);
  const router = useRouter();
  const updateDetailsMutation = api.transcription.updateDetails.useMutation();
  const updateTitleMutation = api.transcription.updateTitle.useMutation();
  const assignProjectMutation = api.transcription.assignProject.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Saved",
        message: "Meeting placement updated",
        color: "green",
      });
      void utils.transcription.getDetail.invalidate({ id });
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
      void utils.transcription.getDetail.invalidate({ id });
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
    if (hasSummary || !session.hasTranscript) return;
    if (summaryAttemptedRef.current.has(session.id)) return;
    summaryAttemptedRef.current.add(session.id);
    generateSummary({ transcriptionId: session.id });
  }, [session, generateSummary]);

  // "Extract outputs" (one button on every tab): one reading of the meeting
  // drafts its actions, decisions and open questions, so each item lands in
  // exactly one bucket. Nothing is created or logged until it is reviewed on
  // the Outputs tab (ADR-0007, ADR-0060), which MeetingDetail opens on success.
  const extractOutputsMutation = api.transcription.extractOutputs.useMutation();

  async function handleExtractOutputs(): Promise<boolean> {
    if (!session) return false;
    const transcriptionId = session.id;
    const result = await extractOutputsMutation
      .mutateAsync({ transcriptionId })
      .catch((error: unknown) => {
        notifications.show({
          title: "Couldn't extract outputs",
          message: error instanceof Error && error.message.length > 0 ? error.message : "Extraction failed",
          color: "red",
        });
        return null;
      });
    if (!result) return false;
    const { actions, decisions } = result;
    await Promise.all([
      utils.action.getDraftByTranscription.invalidate({ transcriptionId }),
      utils.action.getByTranscription.invalidate({ transcriptionId }),
      utils.decision.listForMeeting.invalidate({ transcriptionSessionId: transcriptionId }),
      utils.transcription.getDetail.invalidate({ id }),
    ]);

    // Partial transcript coverage is a caveat on a successful run, not a
    // failure — say so plainly rather than leaving the count unexplained.
    for (const warning of decisions.warnings ?? []) {
      notifications.show({
        title: "Part of the transcript was not read",
        message: warning,
        color: "yellow",
        autoClose: 10_000,
      });
    }
    // One half can fail while the other succeeds (a meeting outside a
    // workspace has no decision log, but can still get actions).
    for (const [label, half] of [
      ["Actions", actions],
      ["Decisions", decisions],
    ] as const) {
      if (!half.success && half.errors.length > 0) {
        notifications.show({
          title: `${label} not extracted`,
          message: half.errors.join(", "),
          color: "orange",
        });
      }
    }

    const parts: string[] = [];
    if (actions.draftCount > 0) {
      parts.push(`${actions.draftCount} draft ${actions.draftCount === 1 ? "action" : "actions"}`);
    }
    if (decisions.draftCount > 0) {
      parts.push(
        `${decisions.draftCount} draft ${decisions.draftCount === 1 ? "decision or question" : "decisions & questions"}`,
      );
    }
    if (parts.length > 0) {
      notifications.show({
        title: "Ready to review",
        message: `${parts.join(" and ")} on the Outputs tab.`,
        color: "green",
      });
    } else if (actions.alreadyPublished || decisions.alreadyPublished) {
      notifications.show({
        title: "Already extracted",
        message: "This meeting's outputs have already been reviewed.",
        color: "gray",
      });
    } else if (actions.success || decisions.success) {
      notifications.show({
        title: "Nothing found",
        message:
          decisions.discardedWithoutEvidence > 0
            ? "Candidates were found but none could be backed by a transcript turn."
            : "No actions, decisions or open questions were detected in this meeting.",
        color: "gray",
      });
    }
    return true;
  }

  // Same deterministic-then-review shape as Extract outputs, one level up the
  // altitude ladder: an Action is a task, a Feature is a product capability.
  // Nothing is written to the feature registry until the card's accept step.
  const ideateFeaturesMutation =
    api.transcription.generateDraftFeatures.useMutation({
      onSuccess: (result) => {
        if (!session) return;
        if (result.draftCount === 0) {
          notifications.show({
            title: "No features found",
            message: "No product features were identified in this meeting.",
            color: "gray",
          });
          return;
        }
        const transcriptionId = session.id;
        setMessages((prev) => {
          const alreadyHasCard = prev.some(
            (m) =>
              m.card?.kind === "draft-features" &&
              m.card.transcriptionId === transcriptionId,
          );
          if (alreadyHasCard) return prev;
          const cardMessage: ChatMessage = {
            type: "ai",
            agentName: "Zoe",
            content: result.alreadyDrafted
              ? "Here are the draft features from this meeting — pick a product and accept the ones you want."
              : "I found some product features in this meeting — pick a product and accept the ones you want.",
            card: { kind: "draft-features", transcriptionId },
          };
          return [...prev, cardMessage];
        });
        openModal();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to ideate features",
          color: "red",
        });
      },
    });

  function handleIdeateFeatures() {
    if (!session) return;
    ideateFeaturesMutation.mutate({ transcriptionId: session.id });
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
      void utils.transcription.getDetail.invalidate({ id });
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to update summary",
        color: "red",
      });
    }
  }

  async function handleRenameTitle(title: string) {
    if (!session) return;
    try {
      await updateTitleMutation.mutateAsync({ id: session.id, title });
      utils.transcription.getDetail.setData({ id }, (prev) =>
        prev ? { ...prev, title } : prev,
      );
      // Meeting lists (workspace, project tab, recordings) show the title too.
      void utils.transcription.invalidate();
    } catch (error) {
      notifications.show({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to rename meeting",
        color: "red",
      });
      throw error;
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
      void utils.transcription.getDetail.invalidate({ id });
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
        hasTranscription: session.hasTranscript,
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
      isIdeatingFeatures={ideateFeaturesMutation.isPending}
      isGeneratingSummary={generateSummaryMutation.isPending}
      onSaveSummary={handleSaveSummary}
      onRenameTitle={handleRenameTitle}
      onMeetingDateChange={handleMeetingDateChange}
      onProjectChange={handleProjectChange}
      onIdeateFeatures={handleIdeateFeatures}
      onRegenerateSummary={handleRegenerateSummary}
      onExtractOutputs={handleExtractOutputs}
      isExtractingOutputs={extractOutputsMutation.isPending}
      onArchive={handleArchive}
    />
  );
}
