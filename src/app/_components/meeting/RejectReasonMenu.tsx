"use client";

import { ActionIcon, Menu } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

interface RejectReasonMenuProps<Code extends string> {
  /** The reasons on offer, in the order shown. */
  reasons: readonly { code: Code; label: string }[];
  /** Heading of the menu, e.g. "Reject because…". */
  label: string;
  /** What the caret does, for screen readers, e.g. "Reject with a reason". */
  ariaLabel: string;
  onPick: (reason: Code) => void;
  disabled?: boolean;
}

/**
 * The optional "why" beside a reject or discard button. The button itself
 * still says no in one click; this caret says no with a reason, for a reviewer
 * who wants the extractor to learn what was wrong with the draft.
 */
export function RejectReasonMenu<Code extends string>({
  reasons,
  label,
  ariaLabel,
  onPick,
  disabled,
}: RejectReasonMenuProps<Code>) {
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <ActionIcon size="sm" variant="subtle" color="red" aria-label={ariaLabel} disabled={disabled}>
          <IconChevronDown size={12} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{label}</Menu.Label>
        {reasons.map((reason) => (
          <Menu.Item key={reason.code} onClick={() => onPick(reason.code)}>
            {reason.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
