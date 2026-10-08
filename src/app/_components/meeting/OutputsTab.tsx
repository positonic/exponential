"use client";

import Link from "next/link";
import {
  IconAlertCircle,
  IconCheck,
  IconGavel,
  IconListCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { DraftActionsReviewCard } from "~/app/_components/DraftActionsReviewCard";
import type { MeetingDecision, MeetingViewModel } from "~/lib/meeting-view-model";
import { api, type RouterOutputs } from "~/trpc/react";

type TranscriptAction = RouterOutputs["action"]["getByTranscription"][number];

const DECISION_STATUS_WORD: Record<MeetingDecision["status"], string> = {
  OPEN: "Open",
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  SUPERSEDED: "Superseded",
  DEPRECATED: "Deprecated",
};

/**
 * One logged decision or open question: status dot, label, statement, and its
 * body rendered as Markdown so the extractor's bullets read as bullets.
 */
function DecisionList({ items }: { items: MeetingDecision[] }) {
  return (
    <ul className="mp-dec__list">
      {items.map((d) => (
        <li key={d.id} className="mp-dec__item">
          <span className="mp-dec__dot" data-status={d.status} title={DECISION_STATUS_WORD[d.status]} />
          <div style={{ minWidth: 0 }}>
            <div>
              {d.href ? (
                <Link href={d.href} className="mp-dec__label">
                  {d.label}
                </Link>
              ) : (
                <span className="mp-dec__label">{d.label}</span>
              )}
              {d.statement}
            </div>
            {d.body && (
              <div className="mp-dec__body">
                <MarkdownRenderer content={d.body} variant="compact" />
              </div>
            )}
            {d.evidenceCount > 0 && (
              <span className="mp-dec__meta">
                {d.evidenceCount} transcript {d.evidenceCount === 1 ? "turn" : "turns"} quoted
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The meeting's created actions, compact enough for a column: name, then who
 * and when. Editing and completing stay on the Summary tab's full list.
 */
function ActionList({ items }: { items: TranscriptAction[] }) {
  return (
    <ul className="mp-dec__list">
      {items.map((a) => {
        const assignees = a.assignees
          .map(({ user }) => user.name ?? user.email)
          .filter((name): name is string => Boolean(name));
        const meta = [
          assignees.join(", "),
          a.dueDate ? `due ${new Date(a.dueDate).toLocaleDateString()}` : null,
          a.project?.name ?? null,
        ].filter(Boolean);
        const isDone = a.status === "COMPLETED" || a.status === "DONE";
        return (
          <li key={a.id} className="mp-dec__item" data-testid="outputs-action">
            <span
              className="mp-dec__dot"
              data-status={isDone ? "ACCEPTED" : "PROPOSED"}
              title={isDone ? "Done" : "Open"}
            />
            <div style={{ minWidth: 0 }}>
              <div>{a.name}</div>
              {meta.length > 0 && <span className="mp-dec__meta">{meta.join(" · ")}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface OutputsTabProps {
  transcriptionSessionId: string;
  vm: MeetingViewModel;
  /** The meeting's created (non-draft) actions. */
  actions: TranscriptAction[];
  isActionsLoading: boolean;
  /** Whether the viewer may log a decision from this meeting (ADR-0060). */
  canLogDecision: boolean;
  onLogDecision: () => void;
  /**
   * Run "Extract outputs". The button lives in the right rail; this copy only
   * shows when the rail is hidden on narrow screens. Absent → no button.
   */
  onExtractOutputs?: () => void;
  isExtractingOutputs?: boolean;
  /** The draft-decisions review panel, owned by the caller. */
  decisionDraftsPanel?: React.ReactNode;
}

/**
 * The meeting's Outputs tab: the one place its extracted actions, decisions
 * and open questions are triaged. Drafts waiting for review sit on top —
 * draft actions are created or discarded, draft decisions confirmed or
 * rejected — and what was kept is listed below in three columns. Decisions
 * and open questions are the same entity split by status: an open question
 * is a Decision in `OPEN` (ADR-0060).
 */
export function OutputsTab({
  transcriptionSessionId,
  vm,
  actions,
  isActionsLoading,
  canLogDecision,
  onLogDecision,
  onExtractOutputs,
  isExtractingOutputs,
  decisionDraftsPanel,
}: OutputsTabProps) {
  // Drafts are visible to their creator only; the review card reads the same
  // cache entry.
  const { data: draftActions = [] } = api.action.getDraftByTranscription.useQuery({
    transcriptionId: transcriptionSessionId,
  });
  const total = actions.length + vm.decisions.length + vm.questions.length;
  const hasDecisionDrafts = vm.drafts.length > 0 && Boolean(decisionDraftsPanel);
  const hasDrafts = draftActions.length > 0 || hasDecisionDrafts;

  return (
    <div data-testid="outputs-tab">
      <section>
        <div className="mp-sec">
          <h3>Outputs</h3>
          {total > 0 && <span className="mp-sec__count">{total}</span>}
          <span className="mp-sec__rule" />
          {onExtractOutputs && (
            <button
              className="mp-chipbtn mp-only-narrow"
              onClick={onExtractOutputs}
              type="button"
              disabled={isExtractingOutputs}
            >
              <IconSparkles size={11} /> {isExtractingOutputs ? "Extracting…" : "Extract outputs"}
            </button>
          )}
          {canLogDecision && (
            <button className="mp-chipbtn" onClick={onLogDecision} type="button">
              <IconGavel size={11} /> Log a decision
            </button>
          )}
        </div>

        {hasDrafts && (
          <div className="mp-review" data-testid="outputs-review">
            <div className="mp-review__head">To review</div>
            {draftActions.length > 0 && (
              <div className="mp-card" data-testid="outputs-draft-actions">
                <div className="mp-card__label mp-card__label--action">
                  <IconListCheck size={11} /> Draft actions
                </div>
                <DraftActionsReviewCard transcriptionId={transcriptionSessionId} />
              </div>
            )}
            {hasDecisionDrafts && (
              <div className="mp-card" data-testid="decisions-draft-panel">
                {decisionDraftsPanel}
              </div>
            )}
          </div>
        )}

        <div className="mp-threecard">
          <div className="mp-card">
            <div className="mp-card__label mp-card__label--action">
              <IconListCheck size={11} /> Actions
            </div>
            {isActionsLoading ? (
              <p className="mp-dec__empty">Loading actions…</p>
            ) : actions.length > 0 ? (
              <ActionList items={actions} />
            ) : (
              <p className="mp-dec__empty">
                No actions created yet. Extracted actions are reviewed above before they are added.
              </p>
            )}
          </div>
          <div className="mp-card">
            <div className="mp-card__label mp-card__label--decision">
              <IconCheck size={11} /> Decisions
            </div>
            {vm.decisions.length > 0 ? (
              <DecisionList items={vm.decisions} />
            ) : (
              <p className="mp-dec__empty">
                Nothing logged yet.
                {canLogDecision ? " Mark transcript turns as evidence, then log a decision." : ""}
              </p>
            )}
          </div>
          <div className="mp-card">
            <div className="mp-card__label mp-card__label--question">
              <IconAlertCircle size={11} /> Open questions
            </div>
            {vm.questions.length > 0 ? (
              <DecisionList items={vm.questions} />
            ) : (
              <p className="mp-dec__empty">
                No open questions from this meeting. Anything the meeting raised and left
                unresolved lands here.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
