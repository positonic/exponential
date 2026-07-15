"use client";

import { Menu, Tooltip } from "@mantine/core";

const PILL_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer bg-transparent whitespace-nowrap max-w-56";

/**
 * Compact property pill for detail peeks and modals (the CreateTicketModal
 * Pill pattern, promoted): icon + value, click opens a menu of choices.
 * A SET pill reads dense (icon carries the meaning); an UNSET pill renders
 * ghosted (dashed, dimmed) as an invitation to fill it.
 */
export function PropertyPill({
  icon,
  label,
  tooltip,
  ghost = false,
  children,
}: {
  icon?: React.ReactNode;
  /** Current value when set; property name when ghost. */
  label: React.ReactNode;
  /** Property name, shown on hover (useful when the value hides the name). */
  tooltip?: string;
  /** Unset state: dashed + dimmed. */
  ghost?: boolean;
  /** Menu items. */
  children: React.ReactNode;
}) {
  const button = (
    <button
      type="button"
      className={`${PILL_CLASS} ${
        ghost
          ? "border-dashed border-border-primary text-text-muted hover:border-border-focus hover:text-text-secondary"
          : "border-border-primary text-text-secondary hover:border-border-focus hover:text-text-primary"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
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
