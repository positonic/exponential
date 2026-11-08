"use client";

import { useState } from "react";
import { Anchor, Button, Group, Modal, Text } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

const sentFmt: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

interface AgendaSentStatusProps {
  agendaGeneratedAt: Date | string | null;
  agendaCirculatedAt: Date | string | null;
  /** The agenda was regenerated after it was sent (`agendaGeneratedAt > agendaCirculatedAt`). */
  changedSinceSent: boolean;
  /** How many people the agenda notification went to. */
  recipientCount: number;
  /** "participants", or "attendees" for a one-off meeting. */
  recipientNoun: string;
  /** The pre-read narrative: the body of the notification and the Matrix post. */
  narrative: string | null | undefined;
  /** When given, a changed agenda offers Resend. */
  onResend?: () => void;
  resendLoading?: boolean;
}

/**
 * One line that says whether participants have the agenda the page shows
 * (ADR-0059): "Sent to 4 participants Mon 10 Nov 12:25", or "Sent … · changed
 * since · Resend" once it was regenerated after sending. The pre-read
 * narrative is not on the page; it opens from here as what was sent.
 */
export function AgendaSentStatus({
  agendaGeneratedAt,
  agendaCirculatedAt,
  changedSinceSent,
  recipientCount,
  recipientNoun,
  narrative,
  onResend,
  resendLoading,
}: AgendaSentStatusProps) {
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  if (!agendaGeneratedAt && !agendaCirculatedAt) return null;
  const sentAt = agendaCirculatedAt ? new Date(agendaCirculatedAt).toLocaleString(undefined, sentFmt) : null;
  const narrativeLabel = sentAt && !changedSinceSent ? "what was sent" : "pre-read";

  return (
    <Group gap={6} wrap="wrap" data-testid="agenda-sent-status">
      <Text size="xs" className="text-text-muted">
        {sentAt
          ? changedSinceSent
            ? `Sent ${sentAt}`
            : `Sent to ${recipientCount} ${recipientCount === 1 ? recipientNoun.replace(/s$/, "") : recipientNoun} ${sentAt}`
          : "Not sent yet"}
      </Text>
      {changedSinceSent && (
        <Text size="xs" fw={600} className="text-text-secondary" data-testid="agenda-changed-since-sent">
          · changed since
        </Text>
      )}
      {narrative && (
        <>
          <Text size="xs" className="text-text-muted" aria-hidden>
            ·
          </Text>
          <Anchor component="button" type="button" size="xs" onClick={() => setNarrativeOpen(true)} data-testid="agenda-open-narrative">
            {narrativeLabel}
          </Anchor>
        </>
      )}
      {changedSinceSent && onResend && (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconSend size={12} />}
          loading={resendLoading}
          onClick={onResend}
          data-testid="agenda-resend"
        >
          Resend
        </Button>
      )}
      {narrative && (
        <Modal
          opened={narrativeOpen}
          onClose={() => setNarrativeOpen(false)}
          title={narrativeLabel === "what was sent" ? "What was sent" : "Pre-read"}
          size="lg"
        >
          <MarkdownRenderer content={narrative} variant="prose" />
          <Text size="xs" className="text-text-muted" mt="md">
            The body of the agenda notification and the Matrix post.
            {changedSinceSent ? " The agenda changed after it was sent; this is the latest pre-read." : ""}
          </Text>
        </Modal>
      )}
    </Group>
  );
}
