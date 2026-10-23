import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Panel: the one way to draw a bordered box.
 *
 * Owns the three things every hand-rolled card used to pick for itself:
 * the surface colour, the border colour and the corner radius. Callers choose
 * a *variant* (what kind of surface this is) and a *padding* step; they never
 * pass `rounded-*`, `border-*` or `bg-*` classes. `className` is for layout
 * (margins, grid placement, `text-center`, `divide-y`), and it is appended
 * after the primitive's own classes so it cannot repaint the surface.
 *
 *   <Panel>…</Panel>                        card on a page (surface-secondary, border-primary)
 *   <Panel variant="plain">…</Panel>        the same surface with no border (dashboard cards)
 *   <Panel variant="muted">…</Panel>        quieter tonal panel (meeting cards, list rows)
 *   <Panel variant="elevated">…</Panel>     floats above the page (popover body, callout)
 *   <Panel interactive as="button">…</Panel> hover affordance for a clickable card
 *   <Panel as={Link} href="/x">…</Panel>    any element or component via `as`
 *
 * Radius steps are the shape tokens (dev-docs/styling-architecture.md, "Shape
 * tokens"): md = list rows, lg = cards (default), xl = hero panels.
 */

export type PanelVariant = "default" | "plain" | "muted" | "elevated";
export type PanelRadius = "md" | "lg" | "xl";
export type PanelPadding = "none" | "sm" | "md" | "lg";

// Each variant owns its border too: `plain` has none, so the box model
// matches a bare surface rather than carrying an invisible 1px edge.
const VARIANT: Record<PanelVariant, string> = {
  default: "border bg-surface-secondary border-border-primary",
  plain: "bg-surface-secondary",
  muted: "border bg-background-secondary border-border-subtle",
  elevated: "border bg-background-elevated border-border-primary shadow-md",
};

const RADIUS: Record<PanelRadius, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

const PADDING: Record<PanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

const INTERACTIVE =
  "cursor-pointer transition-colors hover:border-border-focus hover:bg-surface-hover";

interface PanelOwnProps {
  variant?: PanelVariant;
  radius?: PanelRadius;
  padding?: PanelPadding;
  /** Adds the shared hover affordance. Pair with `as="button"` or `as={Link}`. */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
}

export type PanelProps<E extends ElementType = "div"> = PanelOwnProps & {
  /** Element or component to render. Defaults to a `div`. */
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof PanelOwnProps | "as">;

export function Panel<E extends ElementType = "div">({
  as,
  variant = "default",
  radius = "lg",
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: PanelProps<E>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      {...rest}
      className={cx(
        VARIANT[variant],
        RADIUS[radius],
        PADDING[padding],
        interactive && INTERACTIVE,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
