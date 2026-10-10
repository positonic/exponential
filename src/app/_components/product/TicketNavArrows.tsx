"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  LIST_NAV_HINT,
  useListNavHotkeys,
} from "~/app/_components/product/useListNavHotkeys";

/**
 * Prev/next arrows for the ticket detail page. Left goes to the closest
 * lower-numbered ticket in the same product, right to the closest higher one —
 * gaps from deleted tickets are stepped over server-side. An arrow with nothing
 * on that side renders disabled rather than disappearing, so the pair doesn't
 * shift position between tickets.
 *
 * Keys come from useListNavHotkeys, the same bindings the peek drawers use:
 * j/k, plus ⌃⌘←/→ which also work while typing.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const { data } = api.product.ticket.getAdjacent.useQuery(
    { productId, number },
    { enabled: !!productId && number > 0 },
  );

  const href = useCallback(
    (n: number) => `/w/${workspaceSlug}/products/${productSlug}/tickets/${n}`,
    [workspaceSlug, productSlug],
  );

  const prev = data?.prev;
  const next = data?.next;

  const goPrev = useCallback(
    () => prev && router.push(href(prev.number)),
    [prev, router, href],
  );
  const goNext = useCallback(
    () => next && router.push(href(next.number)),
    [next, router, href],
  );

  useListNavHotkeys({
    onPrev: prev ? goPrev : undefined,
    onNext: next ? goNext : undefined,
    root: rootRef,
  });

  // Legacy tickets with no number have no neighbours to walk to.
  if (number <= 0) return null;

  const arrow = (
    dir: "prev" | "next",
    target: { number: number; title: string } | null | undefined,
  ) => {
    const Icon = dir === "prev" ? IconChevronLeft : IconChevronRight;
    const label = target
      ? `#${target.number} · ${target.title}  (${LIST_NAV_HINT[dir]})`
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
            aria-label={dir === "prev" ? "Previous ticket" : "Next ticket"}
          >
            <Icon size={16} />
          </ActionIcon>
        ) : (
          <span
            className="shrink-0 inline-flex items-center px-1 opacity-40"
            role="img"
            aria-label={
              dir === "prev" ? "No earlier ticket" : "No later ticket"
            }
          >
            <Icon size={16} className="text-text-muted" />
          </span>
        )}
      </Tooltip>
    );
  };

  return (
    <div ref={rootRef} className="flex items-center gap-0.5">
      {arrow("prev", prev)}
      {arrow("next", next)}
    </div>
  );
}
