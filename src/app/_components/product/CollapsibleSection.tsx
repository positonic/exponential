"use client";

import { useState } from "react";
import { Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Small dimmed text next to the title (e.g. "3/5 met"). */
  meta?: string;
  defaultOpen?: boolean;
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
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 mb-2 bg-transparent border-0 p-0 cursor-pointer"
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
          <Text size="xs" className="text-text-muted">
            {meta}
          </Text>
        )}
      </button>
      {open && children}
    </div>
  );
}
