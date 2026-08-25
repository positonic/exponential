"use client";

import { IconArrowRight, IconCalendar, IconCheck } from "@tabler/icons-react";
import { COPY } from "./welcomeCopy";
import { type StepAnswer, type WelcomeSetupApi } from "./useWelcomeSetup";
import { AskBlock } from "./AskBlock";
import styles from "./Welcome.module.css";

/**
 * Invited welcome variant — shown instead of the chat/checklist flow when the
 * user joined someone else's workspace via an invitation. Deliberately lean:
 * acknowledge the team they joined, offer the one step that is still personal
 * (calendar connect), and hand them straight to the workspace home. No goal /
 * action / plan steps — onboarding artifacts must never land in the shared
 * workspace, so the variant simply never offers them.
 */
export function WelcomeInvited({ setup }: { setup: WelcomeSetupApi }) {
  const invited = setup.invitedContext;
  if (!invited) return null;

  const calDone = setup.isStepDone("cal");
  const calLabel =
    setup.state?.calendar === "skipped"
      ? COPY.invited.calSkipped
      : setup.state?.calendar === "outlook"
        ? COPY.calChips.outlook
        : setup.state?.calendar === "google"
          ? COPY.calChips.google
          : setup.calendarConnected
            ? COPY.invited.calConnected
            : "";

  const handleCalAnswer = (answer: StepAnswer) => {
    // Google/Outlook navigate into the OAuth flow (the page resumes from
    // server state on return); "skipped" resolves in place.
    void setup.answerStep("cal", answer);
  };

  return (
    <div className={styles.obRoot}>
      <div className={styles.obHead}>
        <h1>{COPY.invited.title(invited.workspaceName)}</h1>
        <p>
          {invited.inviterName
            ? COPY.invited.subtitleWithInviter(invited.inviterName)
            : COPY.invited.subtitle}
        </p>
      </div>

      <div
        className={`${styles.stepCard} ${calDone ? styles.cardDone : styles.cardNext}`}
      >
        <div className={styles.stepCardRow} style={{ cursor: "default" }}>
          <div className={styles.stepCardIcon}>
            {calDone ? <IconCheck size={16} /> : <IconCalendar size={16} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className={styles.stepCardTitle}>
              {COPY.invited.calTitle}
              {!calDone && (
                <span className={styles.stepCardOptional}>OPTIONAL</span>
              )}
            </div>
            {!calDone && (
              <div className={styles.stepCardDesc}>{COPY.invited.calDesc}</div>
            )}
          </div>
          {calDone && (
            <span className={styles.stepCardMade}>
              <IconCheck size={12} />
              {calLabel}
            </span>
          )}
        </div>
        {!calDone && (
          <div className={styles.stepDialog}>
            <AskBlock
              step="cal"
              state={setup.state}
              onAnswer={handleCalAnswer}
              disabled={setup.isAnswerPending}
              hideQuestion
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className={styles.doneCta}
          onClick={() =>
            void setup.completeAndNavigate(`/w/${invited.workspaceSlug}/home`)
          }
        >
          {COPY.invited.cta(invited.workspaceName)}
          <IconArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
