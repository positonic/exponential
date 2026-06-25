"use client";

import { useState } from "react";
import { Textarea, Button, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconSparkles,
  IconCopy,
  IconPencil,
  IconCheck,
  IconAlertCircle,
  IconPlus,
} from "@tabler/icons-react";
import { SmartContentRenderer } from "~/app/_components/SmartContentRenderer";
import { FirefliesSummaryDisplay } from "~/app/_components/FirefliesSummaryRenderer";
import { ActionsList } from "~/app/_components/actions/ActionsList";
import type { MeetingViewModel } from "~/lib/meeting-view-model";
import type { RouterOutputs } from "~/trpc/react";

type TranscriptAction = RouterOutputs["action"]["getByTranscription"][number];

interface SummaryTabProps {
  vm: MeetingViewModel;
  rawSummary: string | null;
  generatedStamp: string | null;
  actions: TranscriptAction[];
  isActionsLoading: boolean;
  hasTranscript: boolean;
  isCreatingActions: boolean;
  /** True while a summary is being auto-generated on view for this meeting. */
  isGeneratingSummary: boolean;
  onSaveSummary: (value: string) => Promise<void>;
  onCreateActions: () => void;
}

export function SummaryTab({
  vm,
  rawSummary,
  generatedStamp,
  actions,
  isActionsLoading,
  hasTranscript,
  isCreatingActions,
  isGeneratingSummary,
  onSaveSummary,
  onCreateActions,
}: SummaryTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const hasSummary = Boolean(vm.firefliesSummary ?? vm.plainSummary);

  function startEdit() {
    setDraft(rawSummary ?? "");
    setIsEditing(true);
  }

  async function save() {
    setIsSaving(true);
    try {
      await onSaveSummary(draft);
      setIsEditing(false);
    } catch {
      // onSaveSummary surfaces its own error notification; stay in edit mode.
    } finally {
      setIsSaving(false);
    }
  }

  function copySummary() {
    const text = vm.plainSummary ?? rawSummary ?? "";
    void navigator.clipboard.writeText(text);
    notifications.show({ message: "Summary copied", color: "green" });
  }

  return (
    <>
      {/* ===== AI summary ===== */}
      <section className="mp-tldr">
        <div className="mp-tldr__head">
          <IconSparkles size={12} /> AI summary
          <span className="mp-spacer" />
          {generatedStamp && <span className="mp-tldr__stamp">generated {generatedStamp}</span>}
        </div>

        {isEditing ? (
          <>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              autosize
              minRows={6}
              maxRows={20}
              placeholder="Enter a summary…"
            />
            <div className="mp-tldr__foot">
              <Button size="xs" loading={isSaving} onClick={() => void save()}>
                Save
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            {vm.firefliesSummary ? (
              <FirefliesSummaryDisplay summary={vm.firefliesSummary} />
            ) : vm.plainSummary ? (
              <div className="mp-tldr__text">
                <SmartContentRenderer content={vm.plainSummary} />
              </div>
            ) : isGeneratingSummary ? (
              <p
                className="mp-tldr__text"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <Loader size="xs" /> Generating summary…
              </p>
            ) : (
              <p className="mp-tldr__text">No summary yet for this meeting.</p>
            )}
            <div className="mp-tldr__foot">
              {hasSummary && (
                <button className="mp-chipbtn" onClick={copySummary}>
                  <IconCopy size={11} /> Copy
                </button>
              )}
              <button className="mp-chipbtn" onClick={startEdit}>
                <IconPencil size={11} /> Edit
              </button>
            </div>
          </>
        )}
      </section>

      {/* ===== Key moments (dormant until AI extraction lands) ===== */}
      {vm.keyMoments.length > 0 && (
        <section>
          <div className="mp-sec">
            <h3>Key moments</h3>
            <span className="mp-sec__count">{vm.keyMoments.length}</span>
            <span className="mp-sec__rule" />
          </div>
        </section>
      )}

      {/* ===== Decisions / Open questions (dormant until AI extraction lands) ===== */}
      {(vm.decisions.length > 0 || vm.questions.length > 0) && (
        <div className="mp-twocard">
          <div className="mp-card">
            <div className="mp-card__label mp-card__label--decision">
              <IconCheck size={11} /> Decisions
            </div>
          </div>
          <div className="mp-card">
            <div className="mp-card__label mp-card__label--question">
              <IconAlertCircle size={11} /> Open questions
            </div>
          </div>
        </div>
      )}

      {/* ===== Actions ===== */}
      <section>
        <div className="mp-sec">
          <h3>Actions</h3>
          {actions.length > 0 && <span className="mp-sec__count">{actions.length}</span>}
          <span className="mp-sec__rule" />
        </div>

        {isActionsLoading ? (
          <div className="mp-empty">Loading actions…</div>
        ) : actions.length > 0 ? (
          <ActionsList
            viewName="transcription-actions"
            actions={actions}
            showCheckboxes={false}
            showProject
          />
        ) : hasTranscript ? (
          <div className="mp-actbar">
            <div className="mp-actbar__txt">
              <b>AI-drafted actions</b> can be pulled from this meeting. Review and confirm the
              ones you want — they’re added to your projects.
            </div>
            <button
              className="mp-btn mp-btn--primary"
              onClick={onCreateActions}
              disabled={isCreatingActions}
            >
              <IconPlus size={13} /> Create Actions
            </button>
          </div>
        ) : (
          <div className="mp-empty">No transcript available to create actions from.</div>
        )}
      </section>
    </>
  );
}
