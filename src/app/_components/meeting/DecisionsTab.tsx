"use client";

import Link from "next/link";
import { IconAlertCircle, IconCheck, IconGavel, IconSparkles } from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import type { MeetingDecision, MeetingViewModel } from "~/lib/meeting-view-model";

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

interface DecisionsTabProps {
  vm: MeetingViewModel;
  hasTranscript: boolean;
  /** Whether the viewer may log a decision from this meeting (ADR-0060). */
  canLogDecision: boolean;
  onLogDecision: () => void;
  /** Extract draft decisions from the notes and transcript (V2). */
  onExtractDecisions?: () => void;
  isExtractingDecisions?: boolean;
  /** The draft-decisions review panel, owned by the caller. */
  draftsPanel?: React.ReactNode;
}

/**
 * The meeting's Decisions tab (ADR-0060): what this meeting settled, what it
 * left open, and the drafts waiting to be reviewed. Decisions and open
 * questions are the same entity split by status — an open question is a
 * Decision in `OPEN`.
 */
export function DecisionsTab({
  vm,
  hasTranscript,
  canLogDecision,
  onLogDecision,
  onExtractDecisions,
  isExtractingDecisions,
  draftsPanel,
}: DecisionsTabProps) {
  const total = vm.decisions.length + vm.questions.length;
  return (
    <div data-testid="decisions-tab">
      <section>
        <div className="mp-sec">
          <h3>Decisions</h3>
          {total > 0 && <span className="mp-sec__count">{total}</span>}
          <span className="mp-sec__rule" />
          {canLogDecision && hasTranscript && onExtractDecisions && (
            <button
              className="mp-chipbtn"
              onClick={onExtractDecisions}
              type="button"
              disabled={isExtractingDecisions}
            >
              <IconSparkles size={11} />{" "}
              {isExtractingDecisions
                ? "Extracting…"
                : vm.drafts.length > 0
                  ? "Review drafts with Zoe"
                  : "Extract decisions & questions"}
            </button>
          )}
          {canLogDecision && (
            <button className="mp-chipbtn" onClick={onLogDecision} type="button">
              <IconGavel size={11} /> Log a decision
            </button>
          )}
        </div>

        {vm.drafts.length > 0 && draftsPanel && (
          <div className="mp-card" data-testid="decisions-draft-panel">
            {draftsPanel}
          </div>
        )}

        <div className="mp-twocard">
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
                No open questions from this meeting. Extraction finds these in the same pass as
                decisions — anything the meeting raised and left unresolved lands here.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
