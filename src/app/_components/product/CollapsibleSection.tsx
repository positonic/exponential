"use client";

import { useState } from "react";
import { Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Small dimmed text next to the title (e.g. "3/5 met"). */
  meta?: string;
  /** Right-aligned header control (e.g. a filter menu). Clicks on it do not
   *  toggle the section. */
  action?: React.ReactNode;
  defaultOpen?: boolean;
  /** Section anatomy rule (design/DESIGN.md): the chevron owns the left
   *  edge, content insets 16px under it. Default on; legacy surfaces (CRM)
   *  opt out until they get their own pass. */
  inset?: boolean;
  children: React.ReactNode;
}

/**
 * A collapsible content section for detail pages (feature/scope detail,
 * Features V2) - the same chevron + uppercase-title header pattern the ticket
 * detail page uses for its Activity block.
 */
export function CollapsibleSection({
  title,
  icon,
  meta,
  action,
  defaultOpen = true,
  inset = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
      <button
        type="button"
        className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <IconChevronDown size={13} className="text-text-muted" />
        ) : (
          <IconChevronRight size={13} className="text-text-muted" />
        )}
        {icon}
        <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
          {title}
        </Text>
        {meta && (
          // One tier below the title (11px vs 12px caps) so the count reads
          // as an annotation, not part of the section name.
          <Text fz={11} className="text-text-muted">
            {meta}
          </Text>
        )}
      </button>
      {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {open && (inset ? <div className="pl-4">{children}</div> : children)}
    </div>
  );
}
