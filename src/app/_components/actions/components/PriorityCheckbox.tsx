import { Checkbox } from "@mantine/core";
import {
  priorityCheckboxBorderVar,
  toVisualPriority,
  type VisualPriority,
} from "~/lib/actions/priority";
import styles from "./PriorityCheckbox.module.css";

interface PriorityCheckboxProps {
  priority: string | null | undefined;
  status: string;
  isOverdue?: boolean;
  onToggle: () => void;
  disabled?: boolean;
  visual?: "circular" | "mantine";
  ariaLabel?: string;
  title?: string;
}

const visualClass: Record<VisualPriority, string> = {
  urgent: styles.urgent ?? "",
  p1: styles.p1 ?? "",
  p2: styles.p2 ?? "",
  p3: styles.p3 ?? "",
  p4: styles.p4 ?? "",
  p5: styles.p5 ?? "",
  quick: styles.quick ?? "",
  scheduled: styles.scheduled ?? "",
  errand: styles.errand ?? "",
  remember: styles.remember ?? "",
  watch: styles.watch ?? "",
  someday: styles.low ?? "",
  normal: "",
};

export function PriorityCheckbox({
  priority,
  status,
  isOverdue = false,
  onToggle,
  disabled = false,
  visual = "circular",
  ariaLabel,
  title,
}: PriorityCheckboxProps) {
  const isDone = status === "COMPLETED" || status === "DONE";

  if (visual === "mantine") {
    return (
      <Checkbox
        size="md"
        radius="xl"
        checked={isDone}
        onChange={onToggle}
        disabled={disabled}
        aria-label={ariaLabel}
        styles={{
          input: {
            borderColor: priorityCheckboxBorderVar(priority),
            backgroundColor: "transparent",
            cursor: "pointer",
            flexShrink: 0,
          },
        }}
      />
    );
  }

  const bucket = toVisualPriority(priority, isOverdue);
  const className = [
    styles.check,
    visualClass[bucket],
    isDone ? styles.done : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
      disabled={disabled}
      title={title ?? `Priority: ${priority ?? "normal"}`}
      aria-label={ariaLabel}
    />
  );
}
