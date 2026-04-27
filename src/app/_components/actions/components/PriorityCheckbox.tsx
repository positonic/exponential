import { Checkbox } from "@mantine/core";
import {
  priorityCheckboxBorderVar,
  toVisualPriority,
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

const visualClass: Record<"urgent" | "high" | "normal" | "low", string> = {
  urgent: styles.urgent ?? "",
  high: styles.high ?? "",
  normal: "",
  low: styles.low ?? "",
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
