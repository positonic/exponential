"use client";

import { useEffect, useRef, useState } from "react";
import { Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { effortToLabel, type EffortUnit } from "~/types/effort";

const MIN_BODY_CHARS = 40;
const DEBOUNCE_MS = 800;

/**
 * "Suggested: M · Accept" next to a ticket form's effort picker (ticket
 * inner.lotus). Asks the server for a size once the body is long enough to
 * say something, re-asks only when the body changes materially (>20% in
 * length), and disappears as soon as a size is set — by accepting it or by
 * picking one manually, which also suppresses further suggestions for this
 * form. Renders nothing when the server returns null (no model configured) or
 * the call fails: a missing suggestion is not an error the person needs.
 */
export function SizeSuggestionChip({
  productId,
  title,
  body,
  effortUnit,
  value,
  onAccept,
}: {
  productId: string;
  title: string;
  body: string;
  effortUnit: EffortUnit;
  /** The form's current points; a non-null value hides the chip. */
  value: number | null;
  onAccept: (points: number) => void;
}) {
  const suggest = api.product.ticket.suggestSize.useMutation();
  const askedForLength = useRef<number | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const accepted = useRef(false);

  // A manual pick (value set without going through Accept) ends suggestions
  // for this form, even if the size is cleared again later.
  useEffect(() => {
    if (value != null && !accepted.current) setSuppressed(true);
  }, [value]);

  useEffect(() => {
    if (suppressed || value != null || !title.trim()) return;
    const text = body.trim();
    if (text.length < MIN_BODY_CHARS) return;
    const previous = askedForLength.current;
    if (previous != null && Math.abs(text.length - previous) / previous <= 0.2) return;

    const handle = setTimeout(() => {
      askedForLength.current = text.length;
      suggest.mutate({ productId, title: title.trim(), body: text });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // `suggest` is a stable mutation handle; listing it would re-arm the timer
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, title, body, value, suppressed]);

  const suggestion = suggest.data;
  if (suppressed || value != null || !suggestion) return null;

  return (
    <Tooltip label={suggestion.rationale} multiline w={280} withArrow position="bottom-start">
      <Group
        gap={6}
        wrap="nowrap"
        className="inline-flex items-center rounded-full border border-dashed border-border-primary px-2.5 py-1 text-xs text-text-secondary"
      >
        <IconSparkles size={13} className="text-text-muted" />
        <Text size="xs" span>
          Suggested: <span className="font-medium text-text-primary">{effortToLabel(suggestion.points, effortUnit)}</span>
        </Text>
        <UnstyledButton
          type="button"
          onClick={() => {
            accepted.current = true;
            onAccept(suggestion.points);
          }}
          className="text-xs font-medium text-brand-primary hover:underline"
        >
          Accept
        </UnstyledButton>
      </Group>
    </Tooltip>
  );
}
