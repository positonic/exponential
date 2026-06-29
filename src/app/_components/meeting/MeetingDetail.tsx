"use client";

import { useMemo, useState } from "react";
import { notifications } from "@mantine/notifications";
import { IconSparkles, IconFileText, IconPhoto } from "@tabler/icons-react";
import "./meeting-detail.css";
import { MeetingHeader } from "./MeetingHeader";
import { SummaryTab } from "./SummaryTab";
import { TranscriptView } from "./TranscriptView";
import { ScreenshotsTab } from "./ScreenshotsTab";
import { ContextRail } from "./ContextRail";
import {
  ParticipantPicker,
  type PendingParticipant,
} from "./ParticipantPicker";
import { buildMeetingViewModel } from "~/lib/meeting-view-model";
import type { MeetingSession } from "~/lib/meeting-view-model";
import type { MeetingProjectOption } from "./MeetingProjectPicker";
import { api, type RouterOutputs } from "~/trpc/react";

type TranscriptAction = RouterOutputs["action"]["getByTranscription"][number];
type Tab = "summary" | "transcript" | "screenshots";

interface MeetingDetailProps {
  session: MeetingSession;
  actions: TranscriptAction[];
  isActionsLoading: boolean;
  /** Candidate projects for placement (edit-scoped, across workspaces). */
  assignableProjects: MeetingProjectOption[];
  isCreatingActions: boolean;
  /** True while a summary is being auto-generated on view for this meeting. */
  isGeneratingSummary: boolean;
  onSaveSummary: (value: string) => Promise<void>;
  onMeetingDateChange: (value: Date | null) => void;
  /** Place the meeting onto a project (null clears placement). */
  onProjectChange: (projectId: string | null) => void;
  onCreateActions: () => void;
  /** Re-run the AI summary, overwriting the stored one (manual refresh). */
  onRegenerateSummary: () => void;
  onArchive: () => void;
}

const dateFmt: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
};

// Exact timestamp for the Details rail, e.g. "04 Jun 2026, 18:19:02".
const timestampFmt: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

export function MeetingDetail({
  session,
  actions,
  isActionsLoading,
  assignableProjects,
  isCreatingActions,
  isGeneratingSummary,
  onSaveSummary,
  onMeetingDateChange,
  onProjectChange,
  onCreateActions,
  onRegenerateSummary,
  onArchive,
}: MeetingDetailProps) {
  const [tab, setTab] = useState<Tab>("summary");
  const [pickerOpen, setPickerOpen] = useState(false);
  const vm = useMemo(() => buildMeetingViewModel(session), [session]);

  const utils = api.useUtils();
  // Identity keys already on the meeting so the picker hides existing people.
  const existingParticipants = useMemo(() => {
    const keys = new Set<string>();
    for (const p of session.participants) {
      if (p.contactId) keys.add(`contact:${p.contactId}`);
      if (p.email?.includes("@")) keys.add(`email:${p.email.toLowerCase()}`);
    }
    return keys;
  }, [session.participants]);

  const addParticipant = api.transcription.addParticipant.useMutation({
    onSuccess: () => {
      void utils.transcription.getById.invalidate({ id: session.id });
    },
    onError: (error) =>
      notifications.show({
        title: "Couldn't add participant",
        message: error.message,
        color: "red",
      }),
  });

  const removeParticipant = api.transcription.removeParticipant.useMutation({
    onSuccess: () => {
      void utils.transcription.getById.invalidate({ id: session.id });
    },
    onError: (error) =>
      notifications.show({
        title: "Couldn't remove participant",
        message: error.message,
        color: "red",
      }),
  });

  function handleAddPerson(person: PendingParticipant) {
    addParticipant.mutate({
      transcriptionSessionId: session.id,
      ...person.payload,
    });
  }

  function handleRemoveParticipant(id: string) {
    removeParticipant.mutate({ id });
  }

  const meetingDateObj = session.meetingDate ? new Date(session.meetingDate) : null;
  const displayDate = meetingDateObj ?? new Date(session.createdAt);
  const dateLabel = displayDate.toLocaleDateString(undefined, dateFmt);
  const timeLabel = meetingDateObj
    ? meetingDateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  const sourceLabel =
    session.sourceIntegration?.name ?? (vm.hasVideo ? "Screen recording" : null);
  const sourceSub = [vm.durationLabel, vm.captureCount > 0 ? `${vm.captureCount} captures` : null]
    .filter(Boolean)
    .join(" · ");

  const workspaceSlug = session.workspace?.slug ?? null;
  const backHref = workspaceSlug ? `/w/${workspaceSlug}/meetings` : "/";
  const projectHref =
    workspaceSlug && session.project?.slug
      ? `/w/${workspaceSlug}/projects/${session.project.slug}`
      : null;

  const generatedStamp = session.processedAt
    ? new Date(session.processedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  function handleShare() {
    if (typeof window === "undefined") return;
    void navigator.clipboard.writeText(window.location.href);
    notifications.show({ message: "Link copied to clipboard", color: "green" });
  }

  function handleExportTranscript() {
    if (!session.transcription || typeof window === "undefined") return;
    const blob = new Blob([session.transcription], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.title ?? "transcript"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleAddParticipant() {
    setPickerOpen(true);
  }

  return (
    <div className="-m-4 -mt-16 sm:-mt-4 lg:-m-8 -mb-20 sm:-mb-4 lg:-mb-8">
      <div className="meeting-detail">
        <MeetingHeader
          title={session.title ?? "Meeting"}
          meetingType={vm.meetingType}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          durationLabel={vm.durationLabel}
          participants={vm.participants}
          sourceLabel={sourceLabel}
          workspaceName={session.workspace?.name ?? null}
          backHref={backHref}
          onShare={handleShare}
        />

        <nav className="mp-tabs" role="tablist" aria-label="Meeting sections">
          <button
            role="tab"
            aria-selected={tab === "summary"}
            className={`mp-tab ${tab === "summary" ? "on" : ""}`}
            onClick={() => setTab("summary")}
          >
            <IconSparkles size={14} /> Summary
          </button>
          <button
            role="tab"
            aria-selected={tab === "transcript"}
            className={`mp-tab ${tab === "transcript" ? "on" : ""}`}
            onClick={() => setTab("transcript")}
          >
            <IconFileText size={14} /> Transcript
            {vm.transcriptCount > 0 && <span className="mp-tab__count">{vm.transcriptCount}</span>}
          </button>
          <button
            role="tab"
            aria-selected={tab === "screenshots"}
            className={`mp-tab ${tab === "screenshots" ? "on" : ""}`}
            onClick={() => setTab("screenshots")}
          >
            <IconPhoto size={14} /> Screenshots
            {vm.captureCount > 0 && <span className="mp-tab__count">{vm.captureCount}</span>}
          </button>
        </nav>

        <div className="mp-body">
          <main className="mp-main" role="tabpanel">
            {tab === "summary" && (
              <SummaryTab
                vm={vm}
                rawSummary={session.summary ?? null}
                generatedStamp={generatedStamp}
                actions={actions}
                isActionsLoading={isActionsLoading}
                hasTranscript={Boolean(session.transcription)}
                isCreatingActions={isCreatingActions}
                isGeneratingSummary={isGeneratingSummary}
                onSaveSummary={onSaveSummary}
                onCreateActions={onCreateActions}
                onRegenerate={onRegenerateSummary}
              />
            )}
            {tab === "transcript" && (
              <TranscriptView
                variant="full"
                transcription={session.transcription}
                sentencesJson={session.sentencesJson}
                chapters={vm.chapters}
                participants={vm.participants}
              />
            )}
            {tab === "screenshots" && (
              <ScreenshotsTab
                screenshots={session.screenshots.map((s) => ({
                  id: s.id,
                  url: s.url,
                  timestamp: s.timestamp,
                }))}
                videoUrl={session.videoUrl}
              />
            )}
          </main>

          <ContextRail
            participants={vm.participants}
            project={session.project ? { name: session.project.name } : null}
            projectHref={projectHref}
            hasVideo={vm.hasVideo}
            videoUrl={session.videoUrl}
            sourceLabel={sourceLabel}
            sourceSub={sourceSub || null}
            sessionId={session.sessionId}
            createdLabel={new Date(session.createdAt).toLocaleString(undefined, timestampFmt)}
            updatedLabel={new Date(session.updatedAt).toLocaleString(undefined, timestampFmt)}
            meetingDate={meetingDateObj}
            onMeetingDateChange={onMeetingDateChange}
            projectId={session.projectId ?? null}
            assignableProjects={assignableProjects}
            onProjectChange={onProjectChange}
            workspaceName={session.workspace?.name ?? null}
            onShare={handleShare}
            onExportTranscript={handleExportTranscript}
            canExport={Boolean(session.transcription)}
            onArchive={onArchive}
            onAddParticipant={handleAddParticipant}
            onRemoveParticipant={handleRemoveParticipant}
            removingParticipantId={
              removeParticipant.isPending
                ? removeParticipant.variables?.id ?? null
                : null
            }
          />
        </div>
      </div>

      <ParticipantPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        workspaceId={session.workspaceId ?? null}
        existing={existingParticipants}
        onAdd={handleAddPerson}
        busy={addParticipant.isPending}
      />
    </div>
  );
}
