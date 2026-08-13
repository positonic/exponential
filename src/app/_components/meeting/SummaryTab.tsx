"use client";

import { useState } from "react";
import { Button, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconSparkles,
  IconCopy,
  IconPencil,
  IconCheck,
  IconAlertCircle,
  IconPlus,
  IconRefresh,
  IconBulb,
} from "@tabler/icons-react";
import { SmartContentRenderer } from "~/app/_components/SmartContentRenderer";
import { FirefliesSummaryDisplay } from "~/app/_components/FirefliesSummaryRenderer";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { parseFirefliesSummary } from "~/lib/fireflies-summary";
import { ActionsList } from "~/app/_components/actions/ActionsList";
import type { MeetingViewModel } from "~/lib/meeting-view-model";
import type { RouterOutputs } from "~/trpc/react";

type TranscriptAction = RouterOutputs["action"]["getByTranscription"][number];

/**
 * What Edit puts on screen. Structured summaries (Fireflies-shaped JSON) edit
 * their two prose fields; everything else edits the raw string.
 */
type EditDraft =
  | { kind: "structured"; overview: string; breakdown: string }
  | { kind: "freeform"; text: string };

interface SummaryTabProps {
  vm: MeetingViewModel;
  rawSummary: string | null;
  generatedStamp: string | null;
  actions: TranscriptAction[];
  isActionsLoading: boolean;
  hasTranscript: boolean;
  isCreatingActions: boolean;
  /** True while feature ideation is running for this meeting. */
  isIdeatingFeatures: boolean;
  /** True while a summary is being auto-generated on view for this meeting. */
  isGeneratingSummary: boolean;
  onSaveSummary: (value: string) => Promise<void>;
  onCreateActions: () => void;
  /** Turn the transcript into reviewable draft product features. */
  onIdeateFeatures: () => void;
  /** Re-run the AI summary, overwriting the stored one (manual refresh). */
  onRegenerate: () => void;
}

export function SummaryTab({
  vm,
  rawSummary,
  generatedStamp,
  actions,
  isActionsLoading,
  hasTranscript,
  isCreatingActions,
  isIdeatingFeatures,
  isGeneratingSummary,
  onSaveSummary,
  onCreateActions,
  onIdeateFeatures,
  onRegenerate,
}: SummaryTabProps) {
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasSummary = Boolean(vm.firefliesSummary ?? vm.plainSummary);

  function startEdit() {
    // Structured summaries are stored as JSON; editing that raw string is
    // hostile, so expose the two prose fields instead and merge them back on
    // save. Anything else (plain text / markdown) is edited as-is.
    const parsed = parseFirefliesSummary(rawSummary);
    if (parsed) {
      setDraft({
        kind: "structured",
        overview: typeof parsed.overview === "string" ? parsed.overview : "",
        breakdown:
          typeof parsed.detailed_breakdown === "string"
            ? parsed.detailed_breakdown
            : "",
      });
    } else {
      setDraft({ kind: "freeform", text: rawSummary ?? "" });
    }
  }

  function serializeDraft(current: EditDraft): string {
    if (current.kind === "freeform") return current.text;
    // Merge the edited prose back into the stored JSON so untouched fields
    // (keywords, bullets, chapters…) survive the edit.
    const base: Record<string, unknown> = {
      ...(parseFirefliesSummary(rawSummary) ?? {}),
    };
    base.overview = current.overview;
    if (current.breakdown.trim()) base.detailed_breakdown = current.breakdown;
    else delete base.detailed_breakdown;
    return JSON.stringify(base);
  }

  async function save() {
    if (!draft) return;
    setIsSaving(true);
    try {
      await onSaveSummary(serializeDraft(draft));
      setDraft(null);
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

        {draft ? (
          <>
            {draft.kind === "structured" ? (
              <Stack gap="sm">
                <div>
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    Overview
                  </Text>
                  <MarkdownInput
                    value={draft.overview}
                    onChange={(value) => setDraft({ ...draft, overview: value })}
                    placeholder="What was the meeting about?"
                    minRows={4}
                    maxRows={12}
                  />
                </div>
                <div>
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    Detailed breakdown
                  </Text>
                  <MarkdownInput
                    value={draft.breakdown}
                    onChange={(value) => setDraft({ ...draft, breakdown: value })}
                    placeholder="Themed sections, decisions, action items…"
                    minRows={8}
                    maxRows={24}
                  />
                </div>
              </Stack>
            ) : (
              <MarkdownInput
                value={draft.text}
                onChange={(value) => setDraft({ ...draft, text: value })}
                placeholder="Enter a summary…"
                minRows={6}
                maxRows={20}
              />
            )}
            <div className="mp-tldr__foot">
              <Button size="xs" loading={isSaving} onClick={() => void save()}>
                Save
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setDraft(null)}>
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
              {hasTranscript && (
                <button
                  className="mp-chipbtn"
                  onClick={onRegenerate}
                  disabled={isGeneratingSummary}
                >
                  {isGeneratingSummary ? (
                    <Loader size={11} />
                  ) : (
                    <IconRefresh size={11} />
                  )}{" "}
                  {hasSummary ? "Regenerate" : "Generate"}
                </button>
              )}
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

        {/* Sits beside Create Actions rather than inside its bar: that bar
            disappears once the meeting has actions, and ideating features
            stays useful after that. */}
        {hasTranscript && (
          <div className="mp-actbar">
            <div className="mp-actbar__txt">
              <b>Product features</b> can be ideated from this meeting. Review
              them, pick a product, and accept the ones worth building.
            </div>
            <button
              className="mp-btn mp-btn--primary"
              onClick={onIdeateFeatures}
              disabled={isIdeatingFeatures}
            >
              <IconBulb size={13} /> Ideate Features
            </button>
          </div>
        )}
      </section>
    </>
  );
}
