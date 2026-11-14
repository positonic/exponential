"use client";

import { useId, useState } from "react";
import {
  IconCheck,
  IconChecklist,
  IconLayersIntersect,
  IconLink,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { NAV_USE_CASES, type NavUseCase } from "~/lib/navLayout";
import { useMenuFeatures } from "~/hooks/useMenuFeatures";
import { ITEM_ICONS } from "~/app/_components/layout/NavLinks";
import { COPY, USE_CASE_COPY } from "./welcomeCopy";
import styles from "./MenuPicker.module.css";

const USE_CASE_ICONS: Record<NavUseCase, Icon> = {
  personal: IconChecklist,
  team: IconUsersGroup,
  both: IconLayersIntersect,
};

/**
 * The menu picker: one question ("what would you like to use this for?") that
 * sets a sensible starting menu, then every menu item explained in a sentence
 * with its own switch. Each choice is saved as it is made and the real sidebar
 * follows, so there is nothing to submit and nothing to lose by leaving.
 *
 * Built to be usable by anyone:
 * - The question is a native radio group and each item a native checkbox with
 *   `role="switch"`, so the keyboard, screen readers and voice control all
 *   work without any scripting of our own. The whole card or row is the
 *   target, not just the small control.
 * - Nothing is said by colour alone: a chosen card gains a tick, and every
 *   switch carries the word On or Off.
 * - A use case flips several switches at once, which a screen-reader user
 *   cannot see, so the result is announced in a polite live region.
 * - No answer is required. Carrying on without choosing keeps the short
 *   default menu.
 *
 * The page that hosts it supplies the heading above and the way out below.
 */
export function MenuPicker() {
  const uid = useId();
  const utils = api.useUtils();
  const menu = useMenuFeatures();

  const { data: setup } = api.welcome.getSetup.useQuery();
  const savedUseCase = setup?.state.useCase;
  const setUseCase = api.welcome.setUseCase.useMutation({
    onSuccess: (state) => {
      utils.welcome.getSetup.setData(undefined, (old) => (old ? { ...old, state } : old));
    },
  });

  // The card chosen in this visit wins over the saved answer, so the tick
  // moves at once and a slow save cannot move it back.
  const [picked, setPicked] = useState<NavUseCase | null>(null);
  const selected: NavUseCase | null =
    picked ?? (savedUseCase && savedUseCase !== "unsure" ? savedUseCase : null);

  const chooseUseCase = (useCase: NavUseCase) => {
    setPicked(useCase);
    menu.applyUseCase(useCase);
    // Recording the answer is best-effort: the menu itself is already saved.
    setUseCase.mutate({ useCase });
  };

  const saveNote =
    menu.status === "saving"
      ? COPY.menu.saving
      : menu.status === "saved"
        ? COPY.menu.saved
        : menu.status === "error"
          ? COPY.menu.saveFailed
          : null;

  return (
    <div className={styles.picker}>
      <fieldset className={styles.question} disabled={menu.isLoading}>
        <legend className={styles.questionTitle}>{COPY.menu.question}</legend>
        <p className={styles.hint}>{COPY.menu.questionHint}</p>
        <div className={styles.cards}>
          {NAV_USE_CASES.map((useCase) => {
            const Glyph = USE_CASE_ICONS[useCase];
            const copy = USE_CASE_COPY[useCase];
            const isSelected = selected === useCase;
            const titleId = `${uid}-uc-${useCase}`;
            const descId = `${titleId}-desc`;
            const startsId = `${titleId}-starts`;
            const starts = menu.presetLabels(useCase);
            return (
              <label
                key={useCase}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
              >
                <input
                  type="radio"
                  name={`${uid}-use-case`}
                  value={useCase}
                  checked={isSelected}
                  onChange={() => chooseUseCase(useCase)}
                  className={styles.visuallyHidden}
                  aria-labelledby={titleId}
                  aria-describedby={`${descId} ${startsId}`}
                />
                <span className={styles.cardTop}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    <Glyph size={18} />
                  </span>
                  <span className={styles.cardTick} aria-hidden="true">
                    {isSelected && <IconCheck size={14} stroke={2.5} />}
                  </span>
                </span>
                <span id={titleId} className={styles.cardTitle}>
                  {copy.title}
                </span>
                <span id={descId} className={styles.cardDesc}>
                  {copy.desc}
                </span>
                <span id={startsId} className={styles.cardStarts}>
                  {COPY.menu.startsWith}: {starts.join(", ")}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section aria-labelledby={`${uid}-list`} className={styles.list}>
        <div className={styles.listHead}>
          <h2 id={`${uid}-list`} className={styles.listTitle}>
            {COPY.menu.listTitle}
          </h2>
          {/* Announced politely: a use case flips several switches at once. */}
          <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
            {!menu.isLoading && (
              <>
                <span>{COPY.menu.count(menu.onCount, menu.features.length)}</span>
                {saveNote && (
                  <span
                    className={`${styles.saveNote} ${menu.status === "error" ? styles.saveNoteError : ""}`}
                  >
                    {menu.status === "saved" && <IconCheck size={12} aria-hidden="true" />}
                    {saveNote}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <p className={styles.hint}>
          {COPY.menu.listHint} <span className={styles.liveHint}>{COPY.menu.liveHint}</span>
        </p>

        {menu.isLoading ? (
          <p className={styles.loading}>Loading your menu…</p>
        ) : (
          <ul className={styles.features}>
            {menu.features.map((feature) => {
              const Glyph = ITEM_ICONS[feature.id] ?? IconLink;
              const nameId = `${uid}-f-${feature.id}`;
              const descId = `${nameId}-desc`;
              return (
                <li key={feature.id} className={styles.featureItem}>
                  <label className={`${styles.feature} ${feature.isOn ? styles.featureOn : ""}`}>
                    <span className={styles.featureIcon} aria-hidden="true">
                      <Glyph size={16} />
                    </span>
                    <span className={styles.featureText}>
                      <span id={nameId} className={styles.featureName}>
                        {feature.label}
                      </span>
                      <span id={descId} className={styles.featureDesc}>
                        {feature.description}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={feature.isOn}
                      onChange={(e) => menu.setFeature(feature.id, e.currentTarget.checked)}
                      className={styles.visuallyHidden}
                      aria-labelledby={nameId}
                      aria-describedby={descId}
                    />
                    <span className={styles.switch} aria-hidden="true">
                      <span className={styles.switchKnob} />
                    </span>
                    <span className={styles.switchWord} aria-hidden="true">
                      {feature.isOn ? COPY.menu.on : COPY.menu.off}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className={styles.afterList}>{COPY.menu.afterList}</p>
      </section>
    </div>
  );
}
