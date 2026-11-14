"use client";

import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { COPY } from "./welcomeCopy";
import { MenuPicker } from "./MenuPicker";
import styles from "./Welcome.module.css";
import pickerStyles from "./MenuPicker.module.css";

/**
 * The menu picker as a page of its own (`/welcome/menu`), for coming back to
 * after the welcome flow: reached from "More" at the bottom of the sidebar.
 * Every choice is already saved by the time "Done" is pressed, so the button
 * is only the way back.
 */
export function MenuSettings() {
  const { workspaceSlug } = useWorkspace();
  return (
    <div className={styles.obRoot}>
      <div className={styles.obHead}>
        <h1>{COPY.menu.settingsTitle}</h1>
        <p>{COPY.menu.settingsSubtitle}</p>
      </div>

      <MenuPicker />

      <div className={pickerStyles.footer}>
        <Link
          href={workspaceSlug ? `/w/${workspaceSlug}/home` : "/today"}
          className={styles.doneCta}
        >
          {COPY.menu.settingsCta}
        </Link>
      </div>
    </div>
  );
}
