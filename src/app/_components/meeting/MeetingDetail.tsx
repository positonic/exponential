"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconGavel, IconSparkles, IconFileText, IconPhoto, IconListCheck } from "@tabler/icons-react";
import "./meeting-detail.css";
import { MeetingHeader } from "./MeetingHeader";
import { PostToMatrixButton } from "~/app/_components/matrix/PostToMatrixButton";
import { SummaryTab } from "./SummaryTab";
import { OutputsTab } from "./OutputsTab";
import { TranscriptView } from "./TranscriptView";
import { ScreenshotsTab } from "./ScreenshotsTab";
import { ContextRail } from "./ContextRail";
import {
  ParticipantPicker,
  type PendingParticipant,
} from "./ParticipantPicker";
import { buildMeetingViewModel } from "~/lib/meeting-view-model";
import type { MeetingSession } from "~/lib/meeting-view-model";
import { turnToEvidence, type DecisionEvidenceTurn } from "~/lib/decision-evidence";
import { meetingTabFromParam, withMeetingTab, type MeetingTab } from "~/lib/meeting-tabs";
import type { TranscriptTurn } from "~/lib/transcript";
import { LogDecisionModal } from "~/app/_components/decisions/LogDecisionModal";
import { DraftDecisionReviewList } from "~/app/_components/decisions/DraftDecisionReviewList";
import type { MeetingOccurrenceOption } from "./MeetingOccurrencePicker";
import type { MeetingFeatureOption } from "./MeetingFeaturePicker";
import { api, type RouterOutputs } from "~/trpc/react";

type TranscriptAction = RouterOutputs["action"]["getByTranscription"][number];

interface MeetingDetailProps {
  session: MeetingSession;
  actions: TranscriptAction[];
  isActionsLoading: boolean;
  /** True while feature ideation is running for this meeting. */
  isIdeatingFeatures: boolean;
  /** True while a summary is being auto-generated on view for this meeting. */
  isGeneratingSummary: boolean;
  onSaveSummary: (value: string) => Promise<void>;
  /** Rename the meeting; the header only offers in-place editing to editors. */
  onRenameTitle: (title: string) => Promise<void>;
  onMeetingDateChange: (value: Date | null) => void;
  /** Place the meeting onto a project (null clears placement). */
  onProjectChange: (projectId: string | null) => void;
  /** Turn the transcript into reviewable draft product features. */
  onIdeateFeatures: () => void;
  /** Re-run the AI summary, overwriting the stored one (manual refresh). */
  onRegenerateSummary: () => void;
  /**
   * "Extract outputs": draft actions, decisions and open questions in one
   * run. Resolves true when it ran, so the page can open the Outputs tab.
   */
  onExtractOutputs: () => Promise<boolean>;
  isExtractingOutputs: boolean;
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
  isIdeatingFeatures,
  isGeneratingSummary,
  onSaveSummary,
  onRenameTitle,
  onMeetingDateChange,
  onProjectChange,
  onIdeateFeatures,
  onRegenerateSummary,
  onExtractOutputs,
  isExtractingOutputs,
  onArchive,
}: MeetingDetailProps) {
  // The open tab lives in the URL (`?tab=<name>`, Summary when absent) so each
  // section is linkable: Share copies the current tab, and decision evidence
  // deep-links to the transcript with a `#turn-<n>` anchor (ADR-0060). Local
  // state keeps a click instant; the URL follows it in `selectTab`.
  const searchParams = useSearchParams();
  const urlTab = meetingTabFromParam(searchParams?.get("tab"));
  const [tab, setTab] = useState<MeetingTab>(urlTab);
  // Back/Forward and in-app links move the URL without a click: follow them.
  useEffect(() => {
    setTab(urlTab);
  }, [urlTab]);

  function selectTab(next: MeetingTab) {
    if (next === tab) return;
    setTab(next);
    // `history.pushState`, not `router.push`: a pushed search param is a
    // navigation, and a navigation is an RSC round trip to the async
    // (sidemenu) layout just to flip a tab. Next syncs pushState into
    // useSearchParams, and Back still steps through the tabs.
    window.history.pushState(null, "", withMeetingTab(window.location.href, next));
  }
  const [pickerOpen, setPickerOpen] = useState(false);

  // Producing drafts takes edit access to the meeting; the server re-checks.
  const canExtractOutputs = session.canEdit && session.hasTranscript;
  async function handleExtractOutputs() {
    // Results are triaged on the Outputs tab, so land there once they exist.
    if (await onExtractOutputs()) selectTab("outputs");
  }

  // Decisions logged from this meeting (confirmed for viewers, drafts for
  // editors) feed the summary tab's Decisions / Open questions block.
  const { data: meetingDecisions } = api.decision.listForMeeting.useQuery(
    { transcriptionSessionId: session.id },
    { enabled: Boolean(session.id) },
  );
  const vm = useMemo(
    () => buildMeetingViewModel(session, meetingDecisions?.decisions ?? []),
    [session, meetingDecisions],
  );
  const canLogDecision = meetingDecisions?.canLogDecision ?? false;

  // Evidence capture: transcript turns marked "Use as evidence" collect here
  // until the modal logs them with the decision.
  const [evidence, setEvidence] = useState<DecisionEvidenceTurn[]>([]);
  const [logDecisionOpen, setLogDecisionOpen] = useState(false);
  const evidenceTurnIndices = useMemo(
    () => new Set(evidence.map((e) => e.turnIndex)),
    [evidence],
  );
  const toggleEvidence = useCallback((turn: TranscriptTurn, turnIndex: number) => {
    setEvidence((prev) =>
      prev.some((e) => e.turnIndex === turnIndex)
        ? prev.filter((e) => e.turnIndex !== turnIndex)
        : [...prev, turnToEvidence(turn, turnIndex)],
    );
  }, []);
  const removeEvidence = useCallback((turnIndex: number) => {
    setEvidence((prev) => prev.filter((e) => e.turnIndex !== turnIndex));
  }, []);
  const decisionMeeting = useMemo(
    () => ({
      id: session.id,
      meetingDate: session.meetingDate ? new Date(session.meetingDate) : null,
      participants: session.participants.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        userId: p.userId,
      })),
    }),
    [session.id, session.meetingDate, session.participants],
  );

  const utils = api.useUtils();
  // The transcript can run to megabytes, so it is fetched when the Transcript
  // tab opens rather than with the meeting record.
  const transcriptQuery = api.transcription.getTranscript.useQuery(
    { id: session.id },
    {
      enabled:
        session.hasTranscript &&
        // The screenshot narrative pairs captures with the transcript's
        // `[SCREENSHOT]` markers, so it needs the body too.
        (tab === "transcript" || (tab === "screenshots" && session.screenshots.length > 0)),
    },
  );

  // Identity keys already on the meeting so the picker hides existing people.
  const existingParticipants = useMemo(() => {
    const keys = new Set<string>();
    for (const p of session.participants) {
      if (p.userId) keys.add(`user:${p.userId}`);
      if (p.contactId) keys.add(`contact:${p.contactId}`);
      if (p.email?.includes("@")) keys.add(`email:${p.email.toLowerCase()}`);
    }
    return keys;
  }, [session.participants]);

  const addParticipant = api.transcription.addParticipant.useMutation({
    onSuccess: () => {
      void utils.transcription.getDetail.invalidate({ id: session.id });
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
      void utils.transcription.getDetail.invalidate({ id: session.id });
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

  // "Part of" (ADR-0059): occurrences of the meeting's workspace within a
  // week either side of the meeting date are the candidates; linking is a
  // meeting edit, so the row is read-only without a workspace.
  const occurrenceWindow = useMemo(() => {
    const day = 86_400_000;
    const anchor = session.meetingDate ? new Date(session.meetingDate) : new Date(session.createdAt);
    return { from: new Date(anchor.getTime() - 7 * day), to: new Date(anchor.getTime() + 7 * day) };
  }, [session.meetingDate, session.createdAt]);
  // Candidates load on the picker's first open — the row itself renders from
  // the meeting record.
  const [occurrencePickerOpened, setOccurrencePickerOpened] = useState(false);
  const { data: occurrenceRows = [], isLoading: isLoadingOccurrences } =
    api.ceremony.listOccurrences.useQuery(
      { workspaceId: session.workspaceId ?? "", from: occurrenceWindow.from, to: occurrenceWindow.to },
      { enabled: occurrencePickerOpened && Boolean(session.workspaceId) },
    );
  const occurrenceOptions = useMemo<MeetingOccurrenceOption[]>(
    () =>
      occurrenceRows.map((o) => ({
        id: o.id,
        ceremonyId: o.ceremonyId,
        ceremonyName: o.ceremony.name,
        scheduledStart: new Date(o.scheduledStart),
      })),
    [occurrenceRows],
  );
  const attachOccurrence = api.ceremony.attachMeeting.useMutation({
    onSuccess: () => void utils.transcription.getDetail.invalidate({ id: session.id }),
    onError: (error) =>
      notifications.show({ title: "Couldn't link ceremony", message: error.message, color: "red" }),
  });
  const detachOccurrence = api.ceremony.detachMeeting.useMutation({
    onSuccess: () => void utils.transcription.getDetail.invalidate({ id: session.id }),
    onError: (error) =>
      notifications.show({ title: "Couldn't unlink ceremony", message: error.message, color: "red" }),
  });
  const onOccurrenceChange = session.workspaceId
    ? (occurrenceId: string | null) => {
        if (occurrenceId) attachOccurrence.mutate({ meetingId: session.id, occurrenceId });
        else detachOccurrence.mutate({ meetingId: session.id });
      }
    : undefined;
  const occurrenceHref =
    vm.occurrence && session.workspace?.slug
      ? `/w/${session.workspace.slug}/ceremonies/${vm.occurrence.ceremonyId}`
      : null;

  // Placement candidates: every project the viewer can edit, across all their
  // workspaces. Only the picker's dropdown needs them, so they load on its
  // first open — the row itself renders from the meeting's own project.
  const [projectPickerOpened, setProjectPickerOpened] = useState(false);
  const { data: assignableProjects = [], isLoading: isLoadingProjects } =
    api.project.getAssignable.useQuery(undefined, { enabled: projectPickerOpened });

  // Features discussed (`MeetingFeature`): any feature in the meeting's
  // workspace. The server decides who may link (workspace members who can
  // edit the meeting); the candidate list loads on the picker's first open.
  const [featurePickerOpened, setFeaturePickerOpened] = useState(false);
  const { data: workspaceFeatures = [], isLoading: isLoadingFeatures } =
    api.product.feature.listForWorkspace.useQuery(
      { workspaceId: session.workspaceId ?? "" },
      {
        enabled:
          featurePickerOpened && session.canLinkFeatures && Boolean(session.workspaceId),
      },
    );
  const featureOptions = useMemo<MeetingFeatureOption[]>(
    () =>
      workspaceFeatures.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        productName: f.product.name,
      })),
    [workspaceFeatures],
  );
  const linkedFeatures = useMemo(
    () =>
      session.featureLinks.map(({ feature }) => ({
        id: feature.id,
        name: feature.name,
        productName: feature.product.name,
        href: session.workspace?.slug
          ? `/w/${session.workspace.slug}/products/${feature.product.slug}/features/${feature.id}`
          : null,
      })),
    [session.featureLinks, session.workspace?.slug],
  );
  const linkFeature = api.transcription.linkFeature.useMutation({
    onSuccess: () => void utils.transcription.getDetail.invalidate({ id: session.id }),
    onError: (error) =>
      notifications.show({ title: "Couldn't link feature", message: error.message, color: "red" }),
  });
  const unlinkFeature = api.transcription.unlinkFeature.useMutation({
    onSuccess: () => void utils.transcription.getDetail.invalidate({ id: session.id }),
    onError: (error) =>
      notifications.show({ title: "Couldn't unlink feature", message: error.message, color: "red" }),
  });
  const isSavingFeatureLink = linkFeature.isPending || unlinkFeature.isPending;
  const onFeatureToggle = session.canLinkFeatures
    ? (featureId: string, linked: boolean) => {
        // The picker's checked state comes from the refetch, so a second click
        // mid-save would re-send the stale action.
        if (isSavingFeatureLink) return;
        const payload = { transcriptionId: session.id, featureId };
        if (linked) linkFeature.mutate(payload);
        else unlinkFeature.mutate(payload);
      }
    : undefined;

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

  async function handleExportTranscript() {
    if (!session.hasTranscript || typeof window === "undefined") return;
    let transcription: string | null;
    try {
      ({ transcription } = await utils.transcription.getTranscript.fetch({ id: session.id }));
    } catch (error) {
      notifications.show({
        title: "Couldn't export transcript",
        message: error instanceof Error ? error.message : "Failed to load the transcript",
        color: "red",
      });
      return;
    }
    if (!transcription) return;
    const blob = new Blob([transcription], { type: "text/plain" });
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
          onRenameTitle={session.canEdit ? onRenameTitle : undefined}
          meetingType={vm.meetingType}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          durationLabel={vm.durationLabel}
          participants={vm.participants}
          sourceLabel={sourceLabel}
          workspaceName={session.workspace?.name ?? null}
          backHref={backHref}
          onShare={handleShare}
          extraActions={
            <PostToMatrixButton
              meetingId={session.id}
              workspaceId={session.workspaceId ?? null}
              projectId={session.projectId ?? null}
            />
          }
        />

        <nav className="mp-tabs" role="tablist" aria-label="Meeting sections">
          <button
            role="tab"
            aria-selected={tab === "summary"}
            className={`mp-tab ${tab === "summary" ? "on" : ""}`}
            onClick={() => selectTab("summary")}
          >
            <IconSparkles size={14} /> Summary
          </button>
          <button
            role="tab"
            aria-selected={tab === "transcript"}
            className={`mp-tab ${tab === "transcript" ? "on" : ""}`}
            onClick={() => selectTab("transcript")}
          >
            <IconFileText size={14} /> Transcript
            {vm.transcriptCount > 0 && <span className="mp-tab__count">{vm.transcriptCount}</span>}
          </button>
          <button
            role="tab"
            aria-selected={tab === "outputs"}
            className={`mp-tab ${tab === "outputs" ? "on" : ""}`}
            onClick={() => selectTab("outputs")}
            data-testid="tab-outputs"
          >
            <IconListCheck size={14} /> Outputs
            {actions.length + vm.decisions.length + vm.questions.length > 0 && (
              <span className="mp-tab__count">
                {actions.length + vm.decisions.length + vm.questions.length}
              </span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={tab === "screenshots"}
            className={`mp-tab ${tab === "screenshots" ? "on" : ""}`}
            onClick={() => selectTab("screenshots")}
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
                hasTranscript={session.hasTranscript}
                isIdeatingFeatures={isIdeatingFeatures}
                isGeneratingSummary={isGeneratingSummary}
                onSaveSummary={onSaveSummary}
                onShowOutputs={() => selectTab("outputs")}
                onIdeateFeatures={onIdeateFeatures}
                onRegenerate={onRegenerateSummary}
              />
            )}
            {tab === "outputs" && (
              <OutputsTab
                transcriptionSessionId={session.id}
                vm={vm}
                actions={actions}
                isActionsLoading={isActionsLoading}
                canLogDecision={canLogDecision}
                onLogDecision={() => setLogDecisionOpen(true)}
                onExtractOutputs={canExtractOutputs ? () => void handleExtractOutputs() : undefined}
                isExtractingOutputs={isExtractingOutputs}
                decisionDraftsPanel={
                  session.workspaceId ? (
                    <DraftDecisionReviewList
                      transcriptionSessionId={session.id}
                      workspaceId={session.workspaceId}
                      drafts={vm.drafts}
                    />
                  ) : null
                }
              />
            )}
            {tab === "transcript" && (
              <>
                {session.hasTranscript && transcriptQuery.isLoading ? (
                  <div className="mp-empty">
                    <Loader size="sm" />
                  </div>
                ) : transcriptQuery.isError ? (
                  <div className="mp-empty">Couldn&apos;t load the transcript.</div>
                ) : (
                <TranscriptView
                  variant="full"
                  transcription={transcriptQuery.data?.transcription ?? null}
                  sentencesJson={transcriptQuery.data?.sentencesJson}
                  chapters={vm.chapters}
                  participants={vm.participants}
                  evidenceTurnIndices={evidenceTurnIndices}
                  onToggleEvidence={canLogDecision ? toggleEvidence : undefined}
                />
                )}
                {evidence.length > 0 && (
                  <div className="mp-evtray" role="status">
                    <IconGavel size={14} />
                    <span>
                      <b>{evidence.length}</b> {evidence.length === 1 ? "turn" : "turns"} marked as
                      evidence
                    </span>
                    <span className="mp-evtray__spacer" />
                    <button className="mp-chipbtn" type="button" onClick={() => setEvidence([])}>
                      Clear
                    </button>
                    <button
                      className="mp-btn mp-btn--primary"
                      type="button"
                      onClick={() => setLogDecisionOpen(true)}
                    >
                      <IconGavel size={13} /> Log a decision
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === "screenshots" && (
              <ScreenshotsTab
                transcriptionSessionId={session.id}
                screenshots={session.screenshots.map((s) => ({
                  id: s.id,
                  url: s.url,
                  timestamp: s.timestamp,
                  createdAt: s.createdAt,
                }))}
                videoUrl={session.videoUrl}
                hasTranscript={session.hasTranscript}
                transcription={transcriptQuery.data?.transcription}
                isTranscriptLoading={session.hasTranscript && transcriptQuery.isLoading}
                isTranscriptError={transcriptQuery.isError}
              />
            )}
          </main>

          <ContextRail
            onExtractOutputs={canExtractOutputs ? () => void handleExtractOutputs() : undefined}
            isExtractingOutputs={isExtractingOutputs}
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
            onProjectPickerOpen={() => setProjectPickerOpened(true)}
            isLoadingProjects={projectPickerOpened && isLoadingProjects}
            onProjectChange={onProjectChange}
            workspaceName={session.workspace?.name ?? null}
            occurrence={vm.occurrence}
            occurrenceHref={occurrenceHref}
            occurrenceOptions={occurrenceOptions}
            onOccurrenceChange={onOccurrenceChange}
            onOccurrencePickerOpen={() => setOccurrencePickerOpened(true)}
            isLoadingOccurrences={occurrencePickerOpened && isLoadingOccurrences}
            linkedFeatures={linkedFeatures}
            featureOptions={featureOptions}
            onFeatureToggle={onFeatureToggle}
            onFeaturePickerOpen={() => setFeaturePickerOpened(true)}
            isLoadingFeatures={featurePickerOpened && isLoadingFeatures}
            onShare={handleShare}
            onExportTranscript={() => void handleExportTranscript()}
            canExport={session.hasTranscript}
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

      {session.workspaceId ? (
        <LogDecisionModal
          opened={logDecisionOpen}
          onClose={() => setLogDecisionOpen(false)}
          workspaceId={session.workspaceId}
          workspaceSlug={workspaceSlug}
          meeting={decisionMeeting}
          evidence={evidence}
          onRemoveEvidence={removeEvidence}
          onCreated={() => setEvidence([])}
        />
      ) : null}

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
