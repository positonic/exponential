"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionIcon, Tooltip } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { api } from "~/trpc/react";

/**
 * Prev/next arrows for the ticket detail page. Left goes to the closest
 * lower-numbered ticket in the same product, right to the closest higher one —
 * gaps from deleted tickets are stepped over server-side. An arrow with nothing
 * on that side renders disabled rather than disappearing, so the pair doesn't
 * shift position between tickets.
 *
 * Two keyboard routes to the same navigation:
 *
 *   ⌃⌘← / ⌃⌘→  works everywhere, including mid-sentence in the title or body.
 *   ← / →        works only when focus is outside a text field.
 *
 * The chord is Control+Command because every simpler arrow combination is
 * already spoken for on macOS: ⌘arrow is browser Back/Forward (and line
 * start/end while typing), ⌥arrow moves by word, ⌘⌥arrow switches browser tabs,
 * ⌃arrow switches Spaces, and fn⌃arrow tiles windows. ⌃⌘arrow is bound by none
 * of them. Mantine's useHotkeys matches modifiers exactly, so the plain ⌘arrow
 * Back/Forward the browser owns still reaches the browser untouched.
 */
export function TicketNavArrows({
  productId,
  number,
  workspaceSlug,
  productSlug,
}: {
  productId: string;
  number: number;
  workspaceSlug: string;
  productSlug: string;
}) {
  const router = useRouter();
  const { data } = api.product.ticket.getAdjacent.useQuery(
    { productId, number },
    { enabled: !!productId && number > 0 },
  );

  const href = useCallback(
    (n: number) => `/w/${workspaceSlug}/products/${productSlug}/tickets/${n}`,
    [workspaceSlug, productSlug],
  );

  const go = useCallback(
    (target: { number: number } | null | undefined) => {
      if (!target) return;
      // An open modal, menu or dropdown owns the keyboard — the ⋯ menu and the
      // property selects both move between items with the arrow keys, and their
      // items are buttons, so useHotkeys' tag filter doesn't cover them.
      // This page keeps ~8 of these mounted-but-hidden, so presence alone
      // proves nothing. getClientRects() is the test that works here:
      // offsetParent is null for position:fixed, which every Mantine dropdown
      // is, so it would report even an open one as closed.
      //
      // Matching on aria-modal rather than role="dialog" deliberately: the Zoe
      // assistant rail is a permanently laid-out role="dialog" (aria-hidden
      // while closed), so keying off the role alone would block every press.
      const overlays = document.querySelectorAll<HTMLElement>(
        '[aria-modal="true"], [role="menu"], [role="listbox"]',
      );
      for (const overlay of overlays) {
        if (
          overlay.getAttribute("aria-hidden") !== "true" &&
          overlay.getClientRects().length > 0
        ) {
          return;
        }
      }
      router.push(href(target.number));
    },
    [router, href],
  );

  // Fires everywhere, including inside the title field and the body editor.
  useHotkeys(
    [
      ["ctrl+meta+ArrowLeft", () => go(data?.prev)],
      ["ctrl+meta+ArrowRight", () => go(data?.next)],
    ],
    [],
    true,
  );

  // Bare arrows are a convenience for reading, so they keep the default guard
  // that ignores inputs, textareas, selects and contenteditable.
  useHotkeys([
    ["ArrowLeft", () => go(data?.prev)],
    ["ArrowRight", () => go(data?.next)],
  ]);

  // Legacy tickets with no number have no neighbours to walk to.
  if (number <= 0) return null;

  const arrow = (
    dir: "prev" | "next",
    target: { number: number; title: string } | null | undefined,
  ) => {
    const Icon = dir === "prev" ? IconChevronLeft : IconChevronRight;
    const key = dir === "prev" ? "⌃⌘←" : "⌃⌘→";
    const label = target
      ? `${key}  #${target.number} · ${target.title}`
      : dir === "prev"
        ? "No earlier ticket"
        : "No later ticket";

    return (
      <Tooltip label={label} withArrow>
        {/* Tooltip needs a real DOM child, so the disabled state stays a span. */}
        {target ? (
          <ActionIcon
            component={Link}
            href={href(target.number)}
            variant="subtle"
            size="sm"
            className="shrink-0 text-text-secondary"
            aria-label={
              dir === "prev" ? "Previous ticket" : "Next ticket"
            }
          >
            <Icon size={16} />
          </ActionIcon>
        ) : (
          <span
            className="shrink-0 inline-flex items-center px-1 opacity-40"
            role="button"
            aria-disabled="true"
            aria-label={dir === "prev" ? "Previous ticket" : "Next ticket"}
          >
            <Icon size={16} className="text-text-muted" />
          </span>
        )}
      </Tooltip>
    );
  };

  return (
    <div className="flex items-center gap-0.5">
      {arrow("prev", data?.prev)}
      {arrow("next", data?.next)}
    </div>
  );
}
