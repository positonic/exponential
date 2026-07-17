"use client";

import { Menu, Tooltip } from "@mantine/core";

/** 8px status/type dot colored from a Mantine palette name - the shared
 *  glyph for pill icons and menu items (one implementation, not per-file
 *  inline spans). */
export function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: `var(--mantine-color-${color}-6)` }}
    />
  );
}

/**
 * Pill class shared by PropertyPill and bespoke pill-shaped triggers (e.g.
 * the labels Popover): one geometry, one state vocabulary - default, hover,
 * and a visible keyboard focus ring.
 */
export function pillClassName(ghost: boolean, iconOnly = false) {
  return [
    "inline-flex h-7 items-center gap-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer bg-transparent whitespace-nowrap max-w-56",
    iconOnly ? "w-7 justify-center px-0" : "px-2.5",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus",
    ghost
      ? "border-dashed border-border-primary text-text-muted hover:border-border-focus hover:text-text-secondary"
      : "border-border-primary text-text-secondary hover:border-border-focus hover:text-text-primary",
  ].join(" ");
}

/**
 * Compact property pill for detail peeks and modals (the CreateTicketModal
 * Pill pattern, promoted): icon + value, click opens a menu of choices.
 * A SET pill reads dense (icon carries the meaning); an UNSET pill renders
 * ghosted (dashed, dimmed) as an invitation to fill it. An empty label
 * renders a circular icon-only pill (the ⋯ overflow).
 */
export function PropertyPill({
  icon,
  label,
  tooltip,
  ghost = false,
  children,
}: {
  icon?: React.ReactNode;
  /** Current value when set; property name when ghost; empty for icon-only. */
  label: React.ReactNode;
  /** Property name, shown on hover (useful when the value hides the name). */
  tooltip?: string;
  /** Unset state: dashed + dimmed. */
  ghost?: boolean;
  /** Menu items. */
  children: React.ReactNode;
}) {
  const iconOnly = label === "" || label == null;
  const button = (
    <button
      type="button"
      className={pillClassName(ghost, iconOnly)}
      // Icon-only pills have no text content; the tooltip doubles as the
      // accessible name.
      aria-label={iconOnly ? tooltip : undefined}
    >
      {icon}
      {!iconOnly && <span className="truncate">{label}</span>}
    </button>
  );
  return (
    <Menu position="bottom-start" withinPortal shadow="md">
      <Menu.Target>
        {tooltip ? (
          <Tooltip label={tooltip} position="top" openDelay={400}>
            {button}
          </Tooltip>
        ) : (
          button
        )}
      </Menu.Target>
      <Menu.Dropdown style={{ maxHeight: 320, overflowY: "auto" }}>
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}

/** A wrapping line of pills; use one per property group. */
export function PillRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}
