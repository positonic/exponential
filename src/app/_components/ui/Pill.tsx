import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Pill: a small rounded-full label. Counts beside a section title, status
 * chips on a row, the "470" next to "Transcript".
 *
 * Tones are the semantic colour tokens the app already has; there is no
 * success/info tone because no `--color-success-bg` token exists yet. Add the
 * token first (globals.css + tailwind.config.ts), then the tone here.
 */

export type PillTone = "neutral" | "brand" | "warning" | "danger";
export type PillSize = "xs" | "sm";

const TONE: Record<PillTone, string> = {
  neutral: "bg-surface-muted border-border-subtle text-text-muted",
  brand: "bg-brand-subtle border-transparent text-brand-primary",
  warning: "bg-warning-bg border-warning-border text-brand-warning",
  danger: "bg-error-bg border-error-border text-brand-error",
};

const SIZE: Record<PillSize, string> = {
  xs: "h-[18px] px-1.5 text-[10.5px]",
  sm: "h-[22px] px-2 text-[11.5px]",
};

interface PillOwnProps {
  tone?: PillTone;
  size?: PillSize;
  /** Leading glyph, typically a 12px Tabler icon. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export type PillProps<E extends ElementType = "span"> = PillOwnProps & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof PillOwnProps | "as">;

export function Pill<E extends ElementType = "span">({
  as,
  tone = "neutral",
  size = "sm",
  icon,
  className,
  children,
  ...rest
}: PillProps<E>) {
  const Tag: ElementType = as ?? "span";
  return (
    <Tag
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-medium tabular-nums",
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </Tag>
  );
}
