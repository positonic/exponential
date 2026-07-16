"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionIcon, Drawer, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsDiagonal,
  IconArrowsDiagonalMinimize2,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
} from "@tabler/icons-react";

// 680 keeps the list usable behind the peek (~42% of a 1600px viewport,
// the 600-700px band Linear-school side panels sit in) and puts the 14px
// prose column near its 65-75ch reading measure; 760 was inherited from
// EditContactDrawer, not derived from content. WIDE is the escape hatch
// for rich PRD bodies and tables.
const NARROW = 680;
const WIDE = 1000;
const WIDE_PREF_KEY = "peek-drawer-wide";

/**
 * Shared peek shell for list pages (tickets, features): a right-side drawer
 * wide enough for rich content, with a narrow/wide toggle (760/1080 - the
 * EditContactDrawer convention scaled up), prev/next to flip through the
 * list without closing (j/k also work), and an escape hatch to the full
 * detail page. Esc closes (Mantine default). Content is entity-specific.
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
  /** Undefined at the list boundary - the button renders disabled. */
  onPrev?: () => void;
  onNext?: () => void;
  children: React.ReactNode;
}) {
  // Width preference persists across opens (per Alex: "widens it daily,
  // it forgets daily"). Read in an effect so SSR stays deterministic.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    setWide(window.localStorage.getItem(WIDE_PREF_KEY) === "1");
  }, []);
  const toggleWide = () =>
    setWide((w) => {
      window.localStorage.setItem(WIDE_PREF_KEY, w ? "0" : "1");
      return !w;
    });

  // j/k flip through the list (Linear convention) - never while typing.
  useEffect(() => {
    if (!opened) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "j" && onNext) onNext();
      if (e.key === "k" && onPrev) onPrev();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [opened, onPrev, onNext]);

  const hasNav = onPrev !== undefined || onNext !== undefined;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={wide ? WIDE : NARROW}
      padding="lg"
      // Keep browser-level gestures (pinch-to-zoom) working while open:
      // the scroll lock's event capture swallows ctrl+wheel/trackpad zoom.
      lockScroll={false}
      withCloseButton
      closeButtonProps={{ "aria-label": "Close peek" }}
      title={
        <Group gap={4}>
          {hasNav && (
            <>
              <Tooltip label="Previous in list (k)" position="bottom">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  className="text-text-muted hover:text-text-primary"
                  onClick={onPrev}
                  disabled={!onPrev}
                  aria-label="Previous item"
                >
                  <IconChevronUp size={15} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Next in list (j)" position="bottom">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  className="text-text-muted hover:text-text-primary"
                  onClick={onNext}
                  disabled={!onNext}
                  aria-label="Next item"
                >
                  <IconChevronDown size={15} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          <Tooltip label={wide ? "Narrow" : "Widen"} position="bottom">
            <ActionIcon
              variant="subtle"
              size="sm"
              className="text-text-muted hover:text-text-primary"
              onClick={toggleWide}
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
        header: {
          backgroundColor: "var(--color-bg-elevated)",
          paddingLeft: 36,
          paddingRight: 24,
        },
        body: { paddingLeft: 36, paddingRight: 28 },
      }}
    >
      {/* Initial focus lands here (not on the title input), so j/k work
          immediately and opening the peek never starts an accidental edit. */}
      <div data-autofocus tabIndex={-1} style={{ outline: "none" }}>
        {children}
      </div>
    </Drawer>
  );
}
