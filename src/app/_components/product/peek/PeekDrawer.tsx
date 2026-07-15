"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionIcon, Drawer, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
} from "@tabler/icons-react";

const NARROW = 760;
const WIDE = 1080;

/**
 * Shared peek shell for list pages (tickets, features): a right-side drawer
 * wide enough for rich content, with a narrow/wide toggle (760/1080 - the
 * EditContactDrawer convention scaled up), prev/next to flip through the
 * list without closing, and an escape hatch to the full detail page.
 * Esc closes (Mantine default). Content is entity-specific.
 */
export function PeekDrawer({
  opened,
  onClose,
  fullPageHref,
  onPrev,
  onNext,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  /** Href of the full detail page (the expand escape hatch). */
  fullPageHref: string | null;
  onPrev?: () => void;
  onNext?: () => void;
  children: React.ReactNode;
}) {
  const [wide, setWide] = useState(false);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={wide ? WIDE : NARROW}
      padding="lg"
      withCloseButton
      title={
        <Group gap={4}>
          {onPrev && (
            <Tooltip label="Previous in list" position="bottom">
              <ActionIcon
                variant="subtle"
                size="sm"
                className="text-text-muted hover:text-text-primary"
                onClick={onPrev}
                aria-label="Previous item"
              >
                <IconChevronUp size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          {onNext && (
            <Tooltip label="Next in list" position="bottom">
              <ActionIcon
                variant="subtle"
                size="sm"
                className="text-text-muted hover:text-text-primary"
                onClick={onNext}
                aria-label="Next item"
              >
                <IconChevronDown size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={wide ? "Narrow" : "Widen"} position="bottom">
            <ActionIcon
              variant="subtle"
              size="sm"
              className="text-text-muted hover:text-text-primary"
              onClick={() => setWide((w) => !w)}
              aria-label={wide ? "Narrow drawer" : "Widen drawer"}
            >
              {wide ? <IconArrowsDiagonalMinimize2 size={15} /> : <IconArrowsDiagonal size={15} />}
            </ActionIcon>
          </Tooltip>
          {fullPageHref && (
            <Tooltip label="Open full page" position="bottom">
              <ActionIcon
                component={Link}
                href={fullPageHref}
                variant="subtle"
                size="sm"
                className="text-text-muted hover:text-text-primary"
                aria-label="Open full page"
              >
                <IconExternalLink size={15} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      }
      styles={{
        content: { backgroundColor: "var(--color-bg-elevated)" },
        header: { backgroundColor: "var(--color-bg-elevated)" },
      }}
    >
      {children}
    </Drawer>
  );
}
