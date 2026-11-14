import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";
import { Pill } from "./Pill";

/**
 * SectionHeader: the uppercase muted label that heads a section or a Panel
 * ("NEEDS YOUR ATTENTION  4", "PARTICIPANTS  +", "LINKED").
 *
 * One row: an optional icon, the title, an optional count pill on the left;
 * an optional action (a link, an icon button) on the right. It sets no outer
 * margin, so compose spacing from the parent (`className="mb-3"` or a
 * flex/grid gap) rather than fighting a default.
 */

export type SectionHeaderSize = "sm" | "md";

const SIZE: Record<SectionHeaderSize, string> = {
  sm: "text-[11px] tracking-[0.06em]",
  md: "text-xs tracking-wider",
};

export interface SectionHeaderProps
  extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  title: ReactNode;
  /** Leading glyph, typically a 14px Tabler icon. */
  icon?: ReactNode;
  /** Shown as a neutral Pill after the title. */
  count?: number | string;
  /** Right-aligned affordance: a link, a button, a menu. */
  action?: ReactNode;
  /** Heading level. Use a real heading when the section is a landmark. */
  as?: "h2" | "h3" | "h4" | "div";
  size?: SectionHeaderSize;
}

export function SectionHeader({
  title,
  icon,
  count,
  action,
  as: Heading = "h3",
  size = "sm",
  className,
  ...rest
}: SectionHeaderProps) {
  return (
    <div
      {...rest}
      className={cx("flex items-center justify-between gap-3", className)}
    >
      <Heading
        className={cx(
          "m-0 inline-flex min-w-0 items-center gap-2 font-semibold uppercase text-text-muted",
          SIZE[size],
        )}
      >
        {icon && <span className="inline-flex shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
        {count !== undefined && <Pill size="xs">{count}</Pill>}
      </Heading>
      {action && <div className="shrink-0 text-xs">{action}</div>}
    </div>
  );
}
