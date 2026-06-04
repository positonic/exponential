"use client";

import { LoadingOverlay, Menu, Modal, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBolt,
  IconCheck,
  IconExternalLink,
  IconLink,
  IconNotes,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  isEmptyFirefliesSummary,
  parseFirefliesSummary,
} from "~/lib/fireflies-summary";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { ActionsPane } from "./transcription-detail/ActionsPane";
import { MeetingHeader } from "./transcription-detail/MeetingHeader";
import { NotesPane } from "./transcription-detail/NotesPane";
import { Rail } from "./transcription-detail/Rail";
import { ScreenshotsPane } from "./transcription-detail/ScreenshotsPane";
import { SummaryPane } from "./transcription-detail/SummaryPane";
import { TranscriptPane } from "./transcription-detail/TranscriptPane";
import {
  extractChapters,
  parseTurns,
  pickTldr,
} from "./transcription-detail/helpers";
import { TranscriptionDraftActionsModal } from "./TranscriptionDraftActionsModal";

type Tab = "summary" | "notes" | "transcript" | "actions" | "screenshots";

interface TranscriptionDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  transcription: any;
  workflows?: any[];
  onSyncToIntegration?: (workflowId: string) => void;
  syncingToIntegration?: string | null;
  onTranscriptionUpdate?: (updated: any) => void;
}

export function TranscriptionDetailsModal({
  opened,
  onClose,
  transcription,
  onTranscriptionUpdate,
}: TranscriptionDetailsModalProps) {
  const { workspace } = useWorkspace();
  const { data: authSession } = useSession();

  // Refetch full data (with participants + actions) once the modal opens.
  const { data: fresh, refetch } = api.transcription.getById.useQuery(
    { id: transcription?.id ?? "" },
    {
      enabled: opened && !!transcription?.id,
      staleTime: 30_000,
    },
  );

  // Prefer fresh data, fall back to the prop while loading.
  const data = useMemo(() => {
    return fresh ?? transcription;
  }, [fresh, transcription]);

  // ---------- tab + jump state ----------
  const [tab, setTab] = useState<Tab>("summary");
  const [jumpToSeconds, setJumpToSeconds] = useState<number | null>(null);
  const [draftActionsOpened, setDraftActionsOpened] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");

  useEffect(() => {
    if (!opened) {
      setTab("summary");
      setJumpToSeconds(null);
      setEditingTitle(false);
      setEditingTranscript(false);
      setEditingNotes(false);
    }
  }, [opened]);

  // ---------- mutations ----------
  const utils = api.useUtils();

  const updateTitleMutation = api.transcription.updateTitle.useMutation({
    onSuccess: (updated) => {
      notifications.show({
        title: "Saved",
        message: "Title updated",
        color: "green",
      });
      setEditingTitle(false);
      onTranscriptionUpdate?.(updated);
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update title",
        color: "red",
      });
    },
  });

  const updateDetailsMutation = api.transcription.updateDetails.useMutation({
    onSuccess: (updated) => {
      notifications.show({
        title: "Saved",
        message: "Changes saved",
        color: "green",
      });
      setEditingTranscript(false);
      setEditingNotes(false);
      onTranscriptionUpdate?.(updated);
      void refetch();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to save changes",
        color: "red",
      });
    },
  });

  const generateDraftsMutation =
    api.transcription.generateDraftActions.useMutation({
      onSuccess: (result) => {
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
        notifications.show({
          title: "Draft actions ready",
          message: "Review and edit the draft actions before saving.",
          color: "green",
        });
        void utils.transcription.getAllTranscriptions.invalidate();
        void refetch();
        setDraftActionsOpened(true);
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to generate draft actions",
          color: "red",
        });
      },
    });

  const generateSummaryMutation =
    api.transcription.generateSummary.useMutation({
      onSuccess: () => {
        notifications.show({
          title: "Summary generated",
          message: "An AI summary was created from the transcript.",
          color: "green",
        });
        void utils.transcription.getAllTranscriptions.invalidate();
        void refetch();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to generate summary",
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
      void utils.transcription.getAllTranscriptions.invalidate();
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to archive",
        color: "red",
      });
    },
  });

  const deleteMutation = api.transcription.deleteTranscription.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Deleted",
        message: "Meeting record removed.",
        color: "green",
      });
      void utils.transcription.getAllTranscriptions.invalidate();
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to delete",
        color: "red",
      });
    },
  });

  // ---------- derived values ----------
  const summaryData = useMemo(
    () => (data?.summary ? parseFirefliesSummary(data.summary as string) : null),
    [data?.summary],
  );
  const summaryUsable =
    summaryData && !isEmptyFirefliesSummary(summaryData) ? summaryData : null;

  const tldr = pickTldr(summaryUsable, data?.summary ?? null);
  const chapters = extractChapters(summaryUsable);
  const turns = useMemo(
    () =>
      parseTurns(
        (data?.transcription as string | null) ?? null,
        data?.sentencesJson,
      ),
    [data?.transcription, data?.sentencesJson],
  );

  const handleJumpToTimestamp = useCallback((startSeconds: number) => {
    setTab("transcript");
    setJumpToSeconds(startSeconds);
  }, []);

  // Build participants list. If we have structured participants, use them;
  // otherwise derive a placeholder list from transcript speaker names so the
  // rail isn't empty for legacy records.
  const meEmail = authSession?.user?.email?.toLowerCase();
  const meName = authSession?.user?.name ?? null;

  const participants = useMemo(() => {
    const raw = (data?.participants as Array<{
      id: string;
      name: string | null;
      email: string;
      isHost: boolean;
      userId: string | null;
    }> | undefined) ?? [];
    if (raw.length > 0) {
      return raw.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        isHost: p.isHost,
        isMe: p.email?.toLowerCase() === meEmail,
      }));
    }
    // Derive from turns
    const seen = new Map<string, { id: string; name: string; email: string }>();
    for (const t of turns) {
      if (!seen.has(t.speaker)) {
        seen.set(t.speaker, {
          id: `derived-${seen.size}`,
          name: t.speaker,
          email: "",
        });
      }
    }
    return [...seen.values()].map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      isHost: false,
      isMe:
        !!meName && p.name.toLowerCase().includes(meName.toLowerCase().split(" ")[0]!),
    }));
  }, [data?.participants, turns, meEmail, meName]);

  // Type pill: from Fireflies meeting_type, capitalized. Fallback "Meeting".
  const meetingTypeLabel = useMemo(() => {
    const t = summaryUsable?.meeting_type;
    if (typeof t === "string" && t.trim().length > 0) return t.toUpperCase();
    return "MEETING";
  }, [summaryUsable]);

  const sourceTitle = data?.sourceIntegration?.provider
    ? `${capitalize(data.sourceIntegration.provider)} sync`
    : "Manual transcript";
  const sourceSub = data?.sourceIntegration?.name
    ? data.sourceIntegration.name
    : data?.createdAt
      ? `Uploaded ${new Date(data.createdAt).toLocaleDateString()}`
      : "—";

  const links = useMemo(() => {
    const out: Array<{
      href: string;
      glyph: string;
      title: string;
      sub: string;
    }> = [];
    const project = data?.project;
    const workspaceSlug = workspace?.slug ?? data?.workspace?.slug;
    if (project && workspaceSlug) {
      out.push({
        href: `/w/${workspaceSlug}/projects/${project.slug ?? project.id}`,
        glyph: (project.name?.slice(0, 1) ?? "P").toUpperCase(),
        title: project.name,
        sub: "Project",
      });
    }
    return out;
  }, [data?.project, data?.workspace?.slug, workspace?.slug]);

  const hasScreenshots =
    Array.isArray(data?.screenshots) && data.screenshots.length > 0;

  // Build a transcript download blob for the copy/export icon.
  const handleCopyTranscript = useCallback(async () => {
    const text =
      typeof data?.transcription === "string" ? data.transcription : "";
    if (!text) {
      notifications.show({
        title: "Nothing to copy",
        message: "No transcript text available.",
        color: "gray",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({
        title: "Copied",
        message: "Transcript copied to clipboard.",
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Copy failed",
        message: "Could not access clipboard.",
        color: "red",
      });
    }
  }, [data?.transcription]);

  if (!transcription) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton={false}
      padding={0}
      transitionProps={{ transition: "fade", duration: 200 }}
      styles={{
        body: { padding: 0, height: "100vh" },
        content: { backgroundColor: "var(--color-bg-secondary)" },
      }}
    >
      <div className="mdm">
        <MeetingHeader
          title={data?.title ?? null}
          sessionId={data?.sessionId ?? "—"}
          meetingTypeLabel={meetingTypeLabel}
          meetingDate={data?.meetingDate ?? data?.createdAt ?? null}
          durationSeconds={data?.durationSeconds ?? null}
          participantCount={participants.length}
          projectName={data?.project?.name ?? null}
          workspaceName={data?.workspace?.name ?? workspace?.name ?? null}
          editingTitle={editingTitle}
          editedTitle={editedTitle}
          onEditedTitleChange={setEditedTitle}
          onStartEditTitle={() => {
            setEditedTitle(data?.title ?? "");
            setEditingTitle(true);
          }}
          onSaveTitle={() => {
            if (!data?.id) return;
            updateTitleMutation.mutate({
              id: data.id,
              title: editedTitle,
            });
          }}
          onCancelEditTitle={() => {
            setEditingTitle(false);
            setEditedTitle("");
          }}
          isSavingTitle={updateTitleMutation.isPending}
          onClose={onClose}
        />

        <div
          className={`mdm-body ${hasScreenshots ? "" : ""}`}
        >
          <div className="mdm-main">
            <TabsBar
              tab={tab}
              setTab={setTab}
              counts={{
                transcript: turns.length,
                actions: data?.actions?.length ?? 0,
                screenshots: data?.screenshots?.length ?? 0,
              }}
              showScreenshots={hasScreenshots}
              onCopyTranscript={() => void handleCopyTranscript()}
              onEditTranscript={() => {
                setEditedTranscript(data?.transcription ?? "");
                setEditingTranscript(true);
                setTab("transcript");
              }}
            />

            {tab === "summary" && (
              <SummaryPane
                tldr={tldr}
                chapters={chapters}
                onJumpToTimestamp={handleJumpToTimestamp}
                canGenerate={turns.length > 0 && !!data?.id}
                isGenerating={generateSummaryMutation.isPending}
                onGenerate={() => {
                  if (data?.id) {
                    generateSummaryMutation.mutate({
                      transcriptionId: data.id,
                    });
                  }
                }}
              />
            )}
            {tab === "notes" && (
              <NotesPane
                notes={
                  typeof data?.notes === "string" ? data.notes : null
                }
                editing={editingNotes}
                editedValue={editedNotes}
                onEditedValueChange={setEditedNotes}
                onStartEdit={() => {
                  setEditedNotes(
                    typeof data?.notes === "string" ? data.notes : "",
                  );
                  setEditingNotes(true);
                }}
                onCancelEdit={() => {
                  setEditingNotes(false);
                  setEditedNotes("");
                }}
                onSave={() => {
                  if (!data?.id) return;
                  updateDetailsMutation.mutate({
                    id: data.id,
                    notes: editedNotes,
                  });
                }}
                isSaving={updateDetailsMutation.isPending}
              />
            )}
            {tab === "transcript" &&
              (editingTranscript ? (
                <div className="mdm-pane">
                  <div className="mdm-transcript">
                    <Textarea
                      autosize
                      minRows={10}
                      maxRows={30}
                      value={editedTranscript}
                      onChange={(e) =>
                        setEditedTranscript(e.currentTarget.value)
                      }
                      styles={{
                        input: { fontFamily: "monospace", fontSize: 13 },
                      }}
                    />
                    <div className="flex gap-2 justify-end mt-3">
                      <button
                        className="mdm-rail__quick-btn"
                        style={{ width: "auto", padding: "6px 12px" }}
                        onClick={() => setEditingTranscript(false)}
                      >
                        <IconX size={13} /> Cancel
                      </button>
                      <button
                        className="mdm-rail__quick-btn"
                        style={{
                          width: "auto",
                          padding: "6px 12px",
                          color: "var(--color-text-primary)",
                          borderColor: "var(--brand-500)",
                          background: "var(--brand-500)",
                        }}
                        onClick={() => {
                          if (!data?.id) return;
                          updateDetailsMutation.mutate({
                            id: data.id,
                            transcription: editedTranscript,
                          });
                        }}
                      >
                        <IconCheck size={13} /> Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <TranscriptPane
                  turns={turns}
                  chapters={chapters}
                  meName={meName}
                  jumpToSeconds={jumpToSeconds}
                  onJumpHandled={() => setJumpToSeconds(null)}
                />
              ))}
            {tab === "actions" && (
              <ActionsPane
                actions={(data?.actions as any[]) ?? []}
                processedAt={data?.processedAt ?? null}
                actionsSavedAt={data?.actionsSavedAt ?? null}
                onGenerateOrReview={() => {
                  if (data?.actionsSavedAt) {
                    setDraftActionsOpened(true);
                  } else if (data?.id) {
                    generateDraftsMutation.mutate({
                      transcriptionId: data.id,
                    });
                  }
                }}
                isGenerating={generateDraftsMutation.isPending}
                onCreateAction={() => {
                  notifications.show({
                    title: "Coming soon",
                    message: "Manual action creation will land in a follow-up.",
                    color: "blue",
                  });
                }}
              />
            )}
            {tab === "screenshots" && hasScreenshots && (
              <ScreenshotsPane
                screenshots={data.screenshots}
                transcription={(data?.transcription as string | null) ?? null}
              />
            )}
          </div>

          <Rail
            participants={participants}
            analyticsJson={data?.analyticsJson}
            links={links}
            sourceTitle={sourceTitle}
            sourceSub={sourceSub}
            onShare={() => {
              const url =
                typeof window !== "undefined" ? window.location.href : "";
              if (!url) return;
              void navigator.clipboard
                .writeText(url)
                .then(() =>
                  notifications.show({
                    title: "Link copied",
                    message: "Share URL copied to clipboard.",
                    color: "green",
                  }),
                )
                .catch(() => undefined);
            }}
            onArchive={() => {
              if (!data?.id) return;
              archiveMutation.mutate({ id: data.id });
            }}
            onDelete={() => {
              if (!data?.id) return;
              if (
                typeof window !== "undefined" &&
                !window.confirm(
                  "Delete this meeting record? Linked actions will be unlinked.",
                )
              )
                return;
              deleteMutation.mutate({ id: data.id });
            }}
          />
        </div>

        <LoadingOverlay
          visible={
            (opened && !data) ||
            archiveMutation.isPending ||
            deleteMutation.isPending
          }
          zIndex={5}
          overlayProps={{ blur: 1, backgroundOpacity: 0.4 }}
        />
      </div>

      <TranscriptionDraftActionsModal
        opened={draftActionsOpened}
        onClose={() => {
          setDraftActionsOpened(false);
          void refetch();
        }}
        transcriptionId={data?.id ?? ""}
      />
    </Modal>
  );
}

interface TabsBarProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  counts: { transcript: number; actions: number; screenshots: number };
  showScreenshots: boolean;
  onCopyTranscript: () => void;
  onEditTranscript: () => void;
}

function TabsBar({
  tab,
  setTab,
  counts,
  showScreenshots,
  onCopyTranscript,
  onEditTranscript,
}: TabsBarProps) {
  return (
    <div className="mdm-tabs">
      <button
        type="button"
        className={`mdm-tab ${tab === "summary" ? "is-active" : ""}`}
        onClick={() => setTab("summary")}
      >
        <IconSparkles size={14} />
        Summary
      </button>
      <button
        type="button"
        className={`mdm-tab ${tab === "notes" ? "is-active" : ""}`}
        onClick={() => setTab("notes")}
      >
        <IconNotes size={14} />
        Notes
      </button>
      <button
        type="button"
        className={`mdm-tab ${tab === "transcript" ? "is-active" : ""}`}
        onClick={() => setTab("transcript")}
      >
        <IconLink size={14} />
        Transcript
        <span className="mdm-tab__count">{counts.transcript}</span>
      </button>
      <button
        type="button"
        className={`mdm-tab ${tab === "actions" ? "is-active" : ""}`}
        onClick={() => setTab("actions")}
      >
        <IconCheck size={14} />
        Actions
        <span className="mdm-tab__count">{counts.actions}</span>
      </button>
      {showScreenshots && (
        <button
          type="button"
          className={`mdm-tab ${tab === "screenshots" ? "is-active" : ""}`}
          onClick={() => setTab("screenshots")}
        >
          <IconBolt size={14} />
          Screenshots
          <span className="mdm-tab__count">{counts.screenshots}</span>
        </button>
      )}
      <div className="flex-1" />
      <div
        className="flex items-center gap-1 pb-2"
      >
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <button className="mdm-icon-btn" aria-label="More">
              <IconLink size={14} />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconLink size={13} />} onClick={onCopyTranscript}>
              Copy transcript
            </Menu.Item>
            <Menu.Item
              leftSection={<IconExternalLink size={13} />}
              onClick={onEditTranscript}
            >
              Edit transcript text
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
