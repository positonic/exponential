"use client";

import { IconArrowRight } from "@tabler/icons-react";
import { COPY } from "./welcomeCopy";
import { MenuPicker } from "./MenuPicker";
import styles from "./Welcome.module.css";
import pickerStyles from "./MenuPicker.module.css";

/**
 * The first screen of the self-signup welcome: the menu picker, ahead of the
 * goal → action → plan steps. Continuing never depends on an answer.
 */
export function WelcomeMenuStep({
  firstName,
  onContinue,
}: {
  firstName: string | null;
  onContinue: () => void;
}) {
  return (
    <div className={styles.obRoot}>
      <div className={styles.obHead}>
        <h1>{COPY.menu.firstRunTitle(firstName)}</h1>
        <p>{COPY.menu.firstRunSubtitle}</p>
      </div>

      <MenuPicker />

      <div className={pickerStyles.footer}>
        <button type="button" className={styles.doneCta} onClick={onContinue}>
          {COPY.menu.firstRunCta}
          <IconArrowRight size={14} aria-hidden="true" />
        </button>
        <p className={pickerStyles.footnote}>{COPY.menu.changeLater}</p>
      </div>
    </div>
  );
}
