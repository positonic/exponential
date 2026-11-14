"use client";

import { IconArrowRight } from "@tabler/icons-react";
import { COPY } from "./welcomeCopy";
import { type WelcomeSetupApi } from "./useWelcomeSetup";
import { MenuPicker } from "./MenuPicker";
import styles from "./Welcome.module.css";
import pickerStyles from "./MenuPicker.module.css";

/**
 * Invited welcome variant — shown instead of the chat/checklist flow when the
 * user joined someone else's workspace via an invitation. Deliberately lean:
 * acknowledge the team they joined, let them choose what goes in their menu
 * (the one thing here that is theirs alone), and hand them straight to the
 * workspace home. No goal / action / plan steps — onboarding artifacts must
 * never land in the shared workspace, so the variant simply never offers them.
 *
 * Calendar connect used to be the step offered here. It was dropped (decision
 * 2026-11-14): it is not the first thing a new member should be asked for,
 * and it stays available from Settings.
 */
export function WelcomeInvited({ setup }: { setup: WelcomeSetupApi }) {
  const invited = setup.invitedContext;
  if (!invited) return null;

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

      <MenuPicker />

      <div className={pickerStyles.footer}>
        <button
          type="button"
          className={styles.doneCta}
          onClick={() =>
            void setup.completeAndNavigate(`/w/${invited.workspaceSlug}/home`)
          }
        >
          {COPY.invited.cta(invited.workspaceName)}
          <IconArrowRight size={14} aria-hidden="true" />
        </button>
        <p className={pickerStyles.footnote}>{COPY.menu.changeLater}</p>
      </div>
    </div>
  );
}
