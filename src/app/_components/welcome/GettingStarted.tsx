"use client";

import { useEffect, useRef, useState } from "react";
import { IconListCheck, IconMessageChatbot } from "@tabler/icons-react";
import { Loader } from "@mantine/core";
import { useWelcomeSetup } from "./useWelcomeSetup";
import { WelcomeChatView } from "./WelcomeChatView";
import { WelcomeChecklistView } from "./WelcomeChecklistView";
import { WelcomeInvited } from "./WelcomeInvited";
import { WelcomeMenuStep } from "./WelcomeMenuStep";
import { COPY } from "./welcomeCopy";
import styles from "./Welcome.module.css";

type ViewMode = "chat" | "checklist";

const VIEW_STORAGE_KEY = "welcome-view";

/**
 * "Getting started" — the post-signup welcome page. It opens with the menu
 * picker (what are you here for, and what should your menu hold), then the
 * assistant, embedded in the page itself (it never auto-opens as an overlay):
 * a Chat view and a Checklist view share the same server-persisted setup
 * progress.
 */
export function GettingStarted() {
  const setup = useWelcomeSetup();
  const [view, setView] = useState<ViewMode>("chat");

  // Whether the menu picker comes first is decided once, when the setup state
  // arrives: only for someone who has neither been past it nor started the
  // steps. It is latched rather than derived, because choosing a card records
  // the answer at once and a derived check would then pull the picker away
  // from under the person while they were still reading the list below it.
  const [menuStep, setMenuStep] = useState<"pending" | "open" | "closed">("pending");
  const setupState = setup.state;
  const isSetupLoading = setup.isLoading;
  const hasProgress = setup.doneCount > 0;
  useEffect(() => {
    if (menuStep !== "pending" || isSetupLoading) return;
    // No state means the setup query failed; fall through to the flow as
    // before rather than holding the page on a spinner.
    setMenuStep(setupState?.useCase === null && !hasProgress ? "open" : "closed");
  }, [menuStep, isSetupLoading, setupState, hasProgress]);

  // The Continue button is gone once the step closes, taking keyboard focus
  // with it. Hand focus to the flow that replaces it, so the next Tab lands
  // in the new content and a screen reader starts reading from there.
  const flowRef = useRef<HTMLDivElement>(null);
  const focusFlowRef = useRef(false);
  useEffect(() => {
    if (menuStep === "closed" && focusFlowRef.current) {
      focusFlowRef.current = false;
      flowRef.current?.focus();
    }
  }, [menuStep]);

  // View preference persists locally; default is Chat.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "checklist") setView("checklist");
    } catch {
      /* default to chat */
    }
  }, []);

  const switchView = (mode: ViewMode) => {
    setView(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* preference is best-effort */
    }
  };

  if (setup.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader size="sm" color="blue" />
      </div>
    );
  }

  // Invited variant: the user joined someone else's workspace via an
  // invitation — no chat/checklist (and no view toggle), just the shortened
  // "you're in" flow. The explore exit stays available like everywhere else.
  if (setup.invitedContext) {
    return (
      <div style={{ position: "relative" }}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.exploreLink}
            onClick={() => void setup.exploreOnOwn()}
          >
            {COPY.chips.explore}
          </button>
        </div>
        <WelcomeInvited setup={setup} />
      </div>
    );
  }

  if (menuStep === "pending") {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader size="sm" color="blue" />
      </div>
    );
  }

  if (menuStep === "open") {
    return (
      <div style={{ position: "relative" }}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.exploreLink}
            onClick={() => void setup.exploreOnOwn()}
          >
            {COPY.chips.explore}
          </button>
        </div>
        <WelcomeMenuStep
          firstName={setup.firstName}
          onContinue={() => {
            setup.finishMenuStep();
            focusFlowRef.current = true;
            setMenuStep("closed");
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={flowRef}
      tabIndex={-1}
      role="region"
      aria-label="Getting started"
      style={{ position: "relative", outline: "none" }}
    >
      <div className={styles.topBar}>
        {!setup.allDone && (
          <button
            type="button"
            className={styles.exploreLink}
            onClick={() => void setup.exploreOnOwn()}
          >
            {COPY.chips.explore}
          </button>
        )}
        <div className={styles.viewToggle} role="tablist" aria-label="Setup view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "chat"}
            className={view === "chat" ? styles.toggleOn : undefined}
            onClick={() => switchView("chat")}
          >
            <IconMessageChatbot size={13} />
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "checklist"}
            className={view === "checklist" ? styles.toggleOn : undefined}
            onClick={() => switchView("checklist")}
          >
            <IconListCheck size={13} />
            Checklist
          </button>
        </div>
      </div>
      {view === "chat" ? (
        <WelcomeChatView setup={setup} />
      ) : (
        <WelcomeChecklistView setup={setup} />
      )}
    </div>
  );
}
