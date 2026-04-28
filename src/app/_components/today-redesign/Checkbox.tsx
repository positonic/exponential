import type { VisualPriority } from "~/lib/actions/priority";

interface CheckboxProps {
  done?: boolean;
  focused?: boolean;
  priority?: VisualPriority;
  onClick?: () => void;
  ariaLabel?: string;
}

export function Checkbox({ done, focused, priority, onClick, ariaLabel }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={ariaLabel ?? "task"}
      className={[
        "td-checkbox",
        priority ? `td-checkbox--prio-${priority}` : "",
        focused ? "td-checkbox--focused" : "",
        done ? "td-checkbox--done" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {done && (
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l5 5L20 7"
            stroke="var(--td-check-mark)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
