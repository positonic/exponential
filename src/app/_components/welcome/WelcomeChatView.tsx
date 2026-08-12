"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconArrowRight,
  IconMicrophone,
  IconPaperclip,
  IconSend,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { COPY, STEP_ORDER, type StepId } from "./welcomeCopy";
import {
  stepDone,
  type StepAnswer,
  type WelcomeSetupApi,
} from "./useWelcomeSetup";
import {
  ArtifactCard,
  AssistantAvatar,
  Burst,
  FrameworkViz,
  PlanPreview,
  ProgressNodes,
  TypingDots,
} from "./WelcomePrimitives";
import { AskBlock } from "./AskBlock";
import styles from "./Welcome.module.css";

interface ChatMessage {
  id: number;
  who: "assistant" | "user";
  body: React.ReactNode;
}

/** What the composer/chips are currently asking for. */
type ActivePrompt = null | "intro" | "done" | StepId;

/**
 * Framework diagram rendered inside a stored chat message. Message bodies are
 * frozen ReactNodes, so this subscribes to the setup query itself — its cells
 * light up live as later steps complete.
 */
function LiveFrameworkViz() {
  const { data } = api.welcome.getSetup.useQuery();
  return <FrameworkViz isStepDone={(id) => stepDone(data, id)} />;
}

/**
 * Chat view — the assistant-guided conversation IS the page. The opening is
 * scripted; each setup answer runs a real create through `setup.answerStep`
 * and renders the created object as an artifact card in the transcript.
 */
export function WelcomeChatView({ setup }: { setup: WelcomeSetupApi }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState<ActivePrompt>(null);
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const startedRef = useRef(false);
  // The scripted flow reads setup state from a ref so queued callbacks always
  // see the latest answers without re-running the kickoff effect.
  const setupRef = useRef(setup);
  setupRef.current = setup;

  const push = useCallback((who: ChatMessage["who"], body: React.ReactNode) => {
    setMessages((prev) => [...prev, { id: ++idRef.current, who, body }]);
  }, []);

  /** Queue an assistant message behind a typing delay. */
  const say = useCallback(
    (body: React.ReactNode, ms = 700): Promise<void> => {
      queueRef.current = queueRef.current.then(
        () =>
          new Promise<void>((resolve) => {
            setTyping(true);
            setTimeout(() => {
              setTyping(false);
              push("assistant", body);
              resolve();
            }, ms);
          }),
      );
      return queueRef.current;
    },
    [push],
  );

  const askNext = useCallback(() => {
    const s = setupRef.current;
    const next = s.nextStep;
    if (!next) {
      void say(
        <div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Burst />
          </div>
          {COPY.done}
        </div>,
        800,
      ).then(() => setActive("done"));
      return;
    }
    void say(<span>{COPY.ask[next]}</span>, 800).then(() => setActive(next));
  }, [say]);

  const handleAnswer = useCallback(
    (step: StepId) => (answer: StepAnswer) => {
      setActive(null);
      push("user", answer.label);

      // Calendar connections leave the page for OAuth — just navigate.
      if (step === "cal" && answer.value !== "skipped") {
        void setupRef.current.answerStep(step, answer);
        return;
      }

      setTyping(true);
      setupRef.current
        .answerStep(step, answer)
        .then(() => {
          const s = setupRef.current;
          const skippedCal = step === "cal" && answer.value === "skipped";
          const madeCopy = skippedCal ? COPY.made.calskip : COPY.made[step];
          const artifact =
            step === "goal" ? (
              <ArtifactCard type="goal" title={answer.value} />
            ) : step === "action" ? (
              <ArtifactCard
                type="action"
                title={answer.value}
                linkFrom="your goal"
              />
            ) : step === "plan" ? (
              <PlanPreview actionName={s.state?.action ?? answer.value} />
            ) : null;
          void say(
            <div>
              {artifact}
              <div
                style={{
                  marginTop: artifact ? 10 : 0,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                {!skippedCal && <Burst />}
                <span>{madeCopy}</span>
              </div>
            </div>,
            1000,
          ).then(() => setTimeout(() => askNext(), 350));
          return s;
        })
        .catch(() => {
          setTyping(false);
          void say(
            <span>
              Hmm, that didn&apos;t save — mind trying that one again?
            </span>,
            600,
          ).then(() => setActive(step));
        });
    },
    [push, say, askNext],
  );

  const startSetup = useCallback(() => {
    setActive(null);
    push("user", COPY.chips.setup);
    setTimeout(() => askNext(), 250);
  }, [push, askNext]);

  const explainMore = useCallback(() => {
    setActive(null);
    push("user", COPY.chips.how);
    void say(
      <div>
        <div style={{ marginBottom: 8 }}>{COPY.howItWorks.main}</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          {COPY.howItWorks.sub}
        </div>
      </div>,
      1100,
    ).then(() => setActive("intro"));
  }, [push, say]);

  const explore = useCallback(() => {
    setActive(null);
    push("user", COPY.chips.explore);
    void say(<span>{COPY.exploreReply}</span>, 800).then(() =>
      setupRef.current.exploreOnOwn(),
    );
  }, [push, say]);

  // Scripted opening — waits for setup state so returning users resume.
  useEffect(() => {
    if (setup.isLoading || !setup.state || startedRef.current) return;
    const timer = setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      const s = setupRef.current;
      const total = STEP_ORDER.length;
      if (s.doneCount >= total) {
        void say(<span>{COPY.done}</span>, 500).then(() => setActive("done"));
        return;
      }
      if (s.doneCount > 0) {
        void say(<span>{COPY.welcomeBack(s.doneCount, total)}</span>, 600).then(
          () => askNext(),
        );
        return;
      }
      void say(
        <span style={{ fontSize: 15 }}>
          {COPY.greet(s.firstName ?? "there")}
        </span>,
        900,
      );
      void say(
        <div>
          <div style={{ marginBottom: 10 }}>{COPY.frame}</div>
          <LiveFrameworkViz />
        </div>,
        900,
      );
      void say(<span>{COPY.intro2}</span>, 800).then(() => setActive("intro"));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.isLoading, !!setup.state]);

  // Keep the newest message in view.
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages, typing, active]);

  const sendFreeText = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (active === "goal" || active === "action") {
      handleAnswer(active)({ value: text, idx: -1, label: text });
      return;
    }
    push("user", text);
    void say(<span>{COPY.freeTextFallback}</span>, 700).then(() => {
      if (active === null || active === "intro") {
        setActive(setupRef.current.nextStep ? "intro" : "done");
      }
    });
  };

  const inSetup = active !== null && active !== "intro" && active !== "done";

  return (
    <div className={styles.chatRoot}>
      <div className={styles.chatRail}>
        <div className={styles.chatRailTitle}>
          {setup.allDone
            ? COPY.doneTitle
            : `Welcome, ${setup.firstName ?? "friend"}`}
        </div>
        <div className={styles.chatRailSub}>
          {setup.allDone ? COPY.railSub.done : COPY.railSub.inProgress}
        </div>
        <ProgressNodes
          isStepDone={setup.isStepDone}
          nextStep={setup.nextStep}
          doneCount={setup.doneCount}
        />
      </div>

      <div className={styles.chatScroll} ref={scrollRef}>
        <div className={styles.chatMsgs}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.who === "user" ? `${styles.msg} ${styles.msgUser}` : styles.msg
              }
            >
              {m.who === "assistant" && <AssistantAvatar />}
              <div className={styles.msgBody}>{m.body}</div>
            </div>
          ))}
          {typing && (
            <div className={styles.msg}>
              <AssistantAvatar />
              <TypingDots />
            </div>
          )}
        </div>

        {active === "intro" && (
          <div className={`${styles.chatActive} ${styles.chips}`}>
            <button
              className={`${styles.chip} ${styles.chipPrimary}`}
              onClick={startSetup}
            >
              {COPY.chips.setup}
            </button>
            <button className={styles.chip} onClick={explainMore}>
              {COPY.chips.how}
            </button>
            <button
              className={`${styles.chip} ${styles.chipGhost}`}
              onClick={explore}
            >
              {COPY.chips.explore}
            </button>
          </div>
        )}
        {inSetup && (
          <div className={styles.chatActive}>
            <AskBlock
              step={active}
              state={setup.state}
              onAnswer={handleAnswer(active)}
              disabled={setup.isAnswerPending}
              hideQuestion
            />
          </div>
        )}
        {active === "done" && (
          <div className={styles.chatActive}>
            <button className={styles.doneCta} onClick={setup.goToToday}>
              {COPY.goToToday}
              <IconArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.chatComposer}>
        <div className={styles.chatComposerBox}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendFreeText()}
            placeholder="Ask anything, or answer in your own words…"
            aria-label="Message the assistant"
          />
          <button title="Attach" aria-label="Attach a file" type="button">
            <IconPaperclip size={15} />
          </button>
          <button title="Voice" aria-label="Voice input" type="button">
            <IconMicrophone size={15} />
          </button>
          <button
            className={styles.composerSend}
            onClick={sendFreeText}
            title="Send"
            aria-label="Send message"
            type="button"
          >
            <IconSend size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
