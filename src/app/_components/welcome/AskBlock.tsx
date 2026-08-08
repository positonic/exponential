"use client";

import { useState } from "react";
import { IconArrowRight, IconCalendar } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  COPY,
  GOAL_SUGGESTIONS,
  actionSuggestions,
  type StepId,
} from "./welcomeCopy";
import { type StepAnswer, type WelcomeSetupState } from "./useWelcomeSetup";
import { PlanPreview } from "./WelcomePrimitives";
import styles from "./Welcome.module.css";

interface AskBlockProps {
  step: StepId;
  state: WelcomeSetupState | null;
  onAnswer: (answer: StepAnswer) => void;
  disabled?: boolean;
  /** Hide the question line (the chat view renders it as its own message). */
  hideQuestion?: boolean;
}

/**
 * One setup question: 3 contextual suggestion chips + free text (goal/action),
 * a confirm-the-plan preview (plan), or provider choices (cal). Shared by the
 * Chat and Checklist views.
 */
export function AskBlock({
  step,
  state,
  onAnswer,
  disabled = false,
  hideQuestion = false,
}: AskBlockProps) {
  const [text, setText] = useState("");
  const question = COPY.ask[step];
  // Shares the cache entry with useWelcomeSetup's query, so this costs no
  // extra round trip and saves threading the flag through both parent views.
  const { data: setup } = api.welcome.getSetup.useQuery();
  const googleCalendarGated = setup ? !setup.googleCalendarAvailable : false;

  if (step === "plan") {
    return (
      <div>
        {!hideQuestion && <div className={styles.askQ}>{question}</div>}
        <PlanPreview actionName={state?.action ?? null} />
        <div className={styles.chips} style={{ marginTop: 10 }}>
          <button
            className={`${styles.chip} ${styles.chipPrimary}`}
            disabled={disabled}
            onClick={() =>
              onAnswer({ value: "confirm", label: COPY.planChips.confirm })
            }
          >
            {COPY.planChips.confirm}
          </button>
          <button
            className={`${styles.chip} ${styles.chipGhost}`}
            disabled={disabled}
            onClick={() =>
              onAnswer({ value: "adjust", label: COPY.planChips.adjust })
            }
          >
            {COPY.planChips.adjust}
          </button>
        </div>
      </div>
    );
  }

  if (step === "cal") {
    return (
      <div>
        {!hideQuestion && <div className={styles.askQ}>{question}</div>}
        <div className={styles.chips}>
          {/* Google's calendar scopes are awaiting verification, so for
              non-testers the chip is shown as coming soon rather than leading
              into an OAuth flow they can't complete. Outlook is unaffected. */}
          <button
            className={styles.chip}
            disabled={disabled || googleCalendarGated}
            onClick={() =>
              onAnswer({ value: "google", label: `Connect ${COPY.calChips.google}` })
            }
          >
            <IconCalendar
              size={13}
              style={{ marginRight: 6, verticalAlign: -2 }}
            />
            {googleCalendarGated
              ? COPY.calChips.googleComingSoon
              : COPY.calChips.google}
          </button>
          <button
            className={styles.chip}
            disabled={disabled}
            onClick={() =>
              onAnswer({ value: "outlook", label: `Connect ${COPY.calChips.outlook}` })
            }
          >
            <IconCalendar
              size={13}
              style={{ marginRight: 6, verticalAlign: -2 }}
            />
            {COPY.calChips.outlook}
          </button>
          <button
            className={`${styles.chip} ${styles.chipGhost}`}
            disabled={disabled}
            onClick={() => onAnswer({ value: "skipped", label: COPY.calChips.skip })}
          >
            {COPY.calChips.skip}
          </button>
        </div>
      </div>
    );
  }

  const choices =
    step === "goal"
      ? GOAL_SUGGESTIONS
      : actionSuggestions(state?.goalSuggestionIndex ?? -1);

  const submitFreeText = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onAnswer({ value, idx: -1, label: value });
  };

  return (
    <div>
      {!hideQuestion && <div className={styles.askQ}>{question}</div>}
      <div className={styles.chips}>
        {choices.map((choice, i) => (
          <button
            key={choice}
            className={styles.chip}
            disabled={disabled}
            onClick={() =>
              onAnswer({
                value: choice,
                idx: step === "goal" ? i : (state?.goalSuggestionIndex ?? -1),
                label: choice,
              })
            }
          >
            {choice}
          </button>
        ))}
      </div>
      <div className={styles.askInput}>
        <input
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitFreeText()}
          placeholder={
            step === "goal" ? "Or type your own goal…" : "Or write your own…"
          }
        />
        <button
          onClick={submitFreeText}
          disabled={disabled}
          title="Submit"
          aria-label="Submit answer"
        >
          <IconArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
