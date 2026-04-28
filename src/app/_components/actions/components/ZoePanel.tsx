import { IconCheck, IconSparkles, IconX } from "@tabler/icons-react";
import { addDays } from "~/lib/actions/dates";
import type { Action } from "~/lib/actions/types";
import type { SchedulingSuggestionData } from "../../SchedulingSuggestion";
import { HTMLContent } from "../../HTMLContent";
import styles from "./ZoePanel.module.css";

interface ZoePanelProps {
  suggestions: SchedulingSuggestionData[];
  actionsById: Map<string, Action>;
  onAcceptAll: () => void;
  onAccept: (s: SchedulingSuggestionData) => void;
  onDismissAll: () => void;
  onDismissOne: (actionId: string) => void;
}

export function ZoePanel({
  suggestions,
  actionsById,
  onAcceptAll,
  onAccept,
  onDismissAll,
  onDismissOne,
}: ZoePanelProps) {
  const visible = suggestions.slice(0, 3);

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.glyph}>
          <IconSparkles size={12} />
        </div>
        <div>
          <div className={styles.title}>
            {suggestions.length} suggestions from Zoe
          </div>
          <div className={styles.sub}>
            Based on your calendar, energy, and priorities for today.
          </div>
        </div>
        <div className={styles.spacer} />
        <button type="button" className={styles.cta} onClick={onAcceptAll}>
          Accept all
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onDismissAll}
          title="Dismiss"
          aria-label="Dismiss suggestions panel"
        >
          <IconX size={13} />
        </button>
      </div>
      <div>
        {visible.map((s) => {
          const action = actionsById.get(s.actionId);
          const date = new Date(`${s.suggestedDate}T${s.suggestedTime}`);
          const today = new Date();
          const tomorrow = addDays(today, 1);
          const isToday = date.toDateString() === today.toDateString();
          const isTomorrow = date.toDateString() === tomorrow.toDateString();
          const timeStr = date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
          const dateLabel = isToday
            ? "today"
            : isTomorrow
              ? "tomorrow"
              : date.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
          const propLabel =
            dateLabel === "today"
              ? "Today"
              : dateLabel === "tomorrow"
                ? "Tomorrow"
                : dateLabel;
          return (
            <div key={s.actionId} className={styles.sug}>
              <div className={styles.sugText}>
                Move{" "}
                <b>
                  {action?.name ? (
                    <HTMLContent html={action.name} compactUrls />
                  ) : (
                    "this action"
                  )}
                </b>{" "}
                to{" "}
                <b>
                  {dateLabel} {timeStr}
                </b>
                {s.reasoning ? <> — {s.reasoning}</> : null}
              </div>
              <div className={styles.prop}>
                {propLabel} {timeStr}
              </div>
              <div className={styles.btns}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnAccept}`}
                  onClick={() => onAccept(s)}
                  title="Accept"
                  aria-label="Accept suggestion"
                >
                  <IconCheck size={14} />
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => onDismissOne(s.actionId)}
                  title="Dismiss"
                  aria-label="Dismiss suggestion"
                >
                  <IconX size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
