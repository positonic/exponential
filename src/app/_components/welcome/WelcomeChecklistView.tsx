"use client";

import { useState } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconSparkles,
} from "@tabler/icons-react";
import {
  COPY,
  STEPS,
  STEP_GROUPS,
  STEP_ORDER,
  type StepId,
  type StepMeta,
} from "./welcomeCopy";
import { type StepAnswer, type WelcomeSetupApi } from "./useWelcomeSetup";
import {
  AssistantAvatar,
  Burst,
  ProgressNodes,
  STEP_ICONS,
} from "./WelcomePrimitives";
import { AskBlock } from "./AskBlock";
import styles from "./Welcome.module.css";

/**
 * Checklist view — guided step cards grouped Align / Deliver / Connect, with
 * the assistant living in a bottom dock that reacts to progress. Shares setup
 * state with the Chat view.
 */
export function WelcomeChecklistView({ setup }: { setup: WelcomeSetupApi }) {
  const [openStep, setOpenStep] = useState<StepId | null>(null);
  const [justDone, setJustDone] = useState<StepId | null>(null);

  const next = setup.nextStep;

  const handleAnswer = (step: StepId) => (answer: StepAnswer) => {
    // Calendar OAuth navigates away; the page resumes from server state.
    if (step === "cal" && answer.value !== "skipped") {
      void setup.answerStep(step, answer);
      return;
    }
    void setup
      .answerStep(step, answer)
      .then(() => {
        setOpenStep(null);
        setJustDone(step);
        setTimeout(() => setJustDone(null), 2600);
      })
      .catch(() => {
        /* keep the dialog open so the user can retry */
      });
  };

  const madeLabel = (id: StepId): string => {
    const state = setup.state;
    if (id === "goal") return state?.goal ?? "";
    if (id === "action") return state?.action ?? "";
    if (id === "plan") return "3 blocks planned";
    if (state?.calendar === "skipped") return "Skipped";
    if (state?.calendar === "outlook") return "Outlook";
    if (state?.calendar === "google") return "Google Calendar";
    return setup.calendarConnected ? "Connected" : "";
  };

  const StepCard = ({ step }: { step: StepMeta }) => {
    const isDone = setup.isStepDone(step.id);
    const isNext = step.id === next;
    const idx = STEP_ORDER.indexOf(step.id);
    const nextIdx = STEP_ORDER.indexOf(next ?? "cal");
    const locked = !isDone && !isNext && idx > nextIdx && step.id !== "cal";
    const open = openStep === step.id;
    const Icon = STEP_ICONS[step.id];

    const cardClass = [
      styles.stepCard,
      isDone ? styles.cardDone : "",
      isNext ? styles.cardNext : "",
      locked ? styles.cardLocked : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={cardClass}>
        <div
          className={styles.stepCardRow}
          onClick={() => {
            if (isDone || locked) return;
            setOpenStep(open ? null : step.id);
          }}
        >
          <div className={styles.stepCardIcon}>
            {isDone ? <IconCheck size={16} /> : <Icon size={16} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className={styles.stepCardTitle}>
              {step.title}
              {step.optional && !isDone && (
                <span className={styles.stepCardOptional}>OPTIONAL</span>
              )}
            </div>
            {!isDone && <div className={styles.stepCardDesc}>{step.desc}</div>}
          </div>
          {isDone ? (
            <span className={styles.stepCardMade}>
              {justDone === step.id && <Burst />}
              <IconCheck size={12} />
              {madeLabel(step.id)}
            </span>
          ) : (
            !locked && (
              <button className={styles.stepCardCta} type="button">
                {open ? "Close" : isNext ? "Do it with me" : "Start"}
                {!open && <IconChevronRight size={12} />}
              </button>
            )
          )}
        </div>
        {open && !isDone && (
          <div className={styles.stepDialog}>
            <div className={styles.stepDialogAsst}>
              <AssistantAvatar size={24} />
              <div
                className={styles.askQ}
                style={{ marginBottom: 0, paddingTop: 2 }}
              >
                {COPY.ask[step.id]}
              </div>
            </div>
            <AskBlock
              step={step.id}
              state={setup.state}
              onAnswer={handleAnswer(step.id)}
              disabled={setup.isAnswerPending}
              hideQuestion
            />
          </div>
        )}
      </div>
    );
  };

  const nudge: [string, string] = justDone
    ? [
        justDone === "cal" && setup.state?.calendar === "skipped"
          ? COPY.made.calskip
          : COPY.made[justDone],
        "",
      ]
    : next
      ? [COPY.nudge[next]?.[0] ?? "", COPY.nudge[next]?.[1] ?? ""]
      : [`${COPY.doneTitle}.`, COPY.done];

  return (
    <div className={styles.obRoot}>
      <div className={styles.obHead}>
        <h1>Welcome, {setup.firstName ?? "friend"}</h1>
        <p>{COPY.checklistSub}</p>
        <ProgressNodes
          isStepDone={setup.isStepDone}
          nextStep={setup.nextStep}
          doneCount={setup.doneCount}
        />
      </div>

      {STEP_GROUPS.map((group) => (
        <div key={group.label} className={styles.obGroup}>
          <div className={styles.obGroupLabel}>
            {group.label}
            <i />
          </div>
          {group.steps.map((id) => {
            const step = STEPS.find((s) => s.id === id);
            return step ? <StepCard key={id} step={step} /> : null;
          })}
        </div>
      ))}

      <div className={styles.dock}>
        <AssistantAvatar size={30} />
        <div className={styles.dockTxt}>
          {justDone && <Burst />}
          <b>{nudge[0]}</b> {nudge[1]}
        </div>
        {next ? (
          <button
            className={styles.dockBtn}
            onClick={() => setOpenStep(next)}
            type="button"
          >
            <IconSparkles size={13} />
            {STEPS.find((s) => s.id === next)?.title}
          </button>
        ) : (
          <button
            className={styles.dockBtn}
            onClick={setup.goToToday}
            type="button"
          >
            {COPY.goToToday}
            <IconArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
