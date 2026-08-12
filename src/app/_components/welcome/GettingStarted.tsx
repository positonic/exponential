"use client";

import { useEffect, useState } from "react";
import { IconListCheck, IconMessageChatbot } from "@tabler/icons-react";
import { Loader } from "@mantine/core";
import { useWelcomeSetup } from "./useWelcomeSetup";
import { WelcomeChatView } from "./WelcomeChatView";
import { WelcomeChecklistView } from "./WelcomeChecklistView";
import { COPY } from "./welcomeCopy";
import styles from "./Welcome.module.css";

type ViewMode = "chat" | "checklist";

const VIEW_STORAGE_KEY = "welcome-view";

/**
 * "Getting started" — the post-signup welcome page. The assistant is embedded
 * in the page itself (it never auto-opens as an overlay): a Chat view and a
 * Checklist view share the same server-persisted setup progress.
 */
export function GettingStarted() {
  const setup = useWelcomeSetup();
  const [view, setView] = useState<ViewMode>("chat");

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

  return (
    <div style={{ position: "relative" }}>
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
