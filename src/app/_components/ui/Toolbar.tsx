import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";

/**
 * Toolbar: a row of controls (filters, view switches, actions) above a list
 * or at the top of a page section. Wraps on narrow screens.
 *
 *   <Toolbar aria-label="Projects">
 *     <Toolbar.Group>…filters…</Toolbar.Group>
 *     <Toolbar.Spacer />
 *     <Toolbar.Group>…actions…</Toolbar.Group>
 *   </Toolbar>
 *
 * `bordered` draws the hairline under it that separates it from the content.
 */

export interface ToolbarProps extends ComponentPropsWithoutRef<"div"> {
  /** Draw the hairline under the row. */
  bordered?: boolean;
}

function ToolbarRoot({ bordered = false, className, ...rest }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      {...rest}
      className={cx(
        "flex flex-wrap items-center gap-2",
        bordered && "border-b border-border-primary pb-3",
        className,
      )}
    />
  );
}

function ToolbarGroup({ className, ...rest }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="group"
      {...rest}
      className={cx("flex items-center gap-1", className)}
    />
  );
}

function ToolbarSpacer({ className, ...rest }: ComponentPropsWithoutRef<"div">) {
  return <div aria-hidden {...rest} className={cx("flex-1", className)} />;
}

export const Toolbar = Object.assign(ToolbarRoot, {
  Group: ToolbarGroup,
  Spacer: ToolbarSpacer,
});
