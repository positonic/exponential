"use client";

import { useRef, useState } from "react";

export interface SegOption {
  value: string;
  label: string;
  /** Token color (e.g. "var(--accent-crm)") shown as a dot on the selected option. */
  color?: string;
}

interface WpSegmentedControlProps {
  /** Accessible group label (announced to screen readers). */
  label: string;
  options: SegOption[];
  value: string;
  onChange?: (value: string) => void;
  /** Read-only controls (e.g. derived Health) render the value but can't be changed. */
  readOnly?: boolean;
}

/**
 * Accessible segmented control — an ARIA radiogroup with roving tabindex and
 * arrow-key navigation. Only the selected option is in the tab order; arrows
 * (or Home/End) move selection and focus together. The color dot shows on the
 * selected option only.
 */
export function WpSegmentedControl({
  label,
  options,
  value,
  onChange,
  readOnly = false,
}: WpSegmentedControlProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  // Roving focus index, seeded at the selected option. Arrow keys move focus
  // ONLY (manual activation); selection commits on click / Enter / Space — so
  // keyboard navigation never fires a persist-per-keystroke.
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);

  const commit = (index: number) => {
    if (readOnly || !onChange) return;
    const opt = options[index];
    if (!opt) return;
    setFocusedIndex(index);
    onChange(opt.value);
  };

  const moveFocus = (index: number) => {
    const n = options.length;
    if (n === 0) return;
    const next = ((index % n) + n) % n;
    setFocusedIndex(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (readOnly) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(focusedIndex + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(focusedIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(options.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-readonly={readOnly || undefined}
      onKeyDown={onKeyDown}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-border-primary bg-background-primary p-1"
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={readOnly}
            tabIndex={readOnly ? -1 : i === focusedIndex ? 0 : -1}
            onClick={() => commit(i)}
            className={
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
              (on
                ? "bg-surface-secondary text-text-primary shadow-sm"
                : "text-text-secondary hover:bg-background-elevated hover:text-text-primary") +
              (readOnly ? " cursor-default" : "")
            }
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: on && o.color ? o.color : "transparent" }}
            />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
