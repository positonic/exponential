'use client';

import { useState } from 'react';
import { Badge, Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconPlayerSkipForward, IconRefresh, IconSparkles } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft, waiting for approval',
  REGENERATING: 'Rewriting…',
  APPROVED: 'Approved',
  SENT: 'Sent',
  SKIPPED: 'Skipped',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'yellow',
  REGENERATING: 'blue',
  APPROVED: 'green',
  SENT: 'green',
  SKIPPED: 'gray',
};

const CHANNEL_LABEL: Record<string, string> = {
  public: 'Public page',
  email: 'Newsletter',
  matrix: 'Team Matrix room',
};

interface Delivery {
  status: 'done' | 'skipped' | 'failed';
  detail?: string;
}

/** Where an approved update went: one line per configured channel. */
function DeliveryList({ deliveries }: { deliveries: unknown }) {
  if (!deliveries || typeof deliveries !== 'object') return null;
  const entries = Object.entries(deliveries as Record<string, Delivery>).filter(
    ([, d]) => d.status !== 'skipped',
  );
  if (entries.length === 0) return null;
  return (
    <ul className="m-0 mt-2 list-none space-y-0.5 p-0" data-testid="update-deliveries">
      {entries.map(([channel, d]) => (
        <li key={channel} className="text-xs text-text-muted">
          <span className="font-medium text-text-secondary">{CHANNEL_LABEL[channel] ?? channel}:</span>{' '}
          {d.status === 'done' ? 'delivered' : 'failed, retrying hourly'}
          {d.detail ? ` (${d.detail})` : ''}
        </li>
      ))}
    </ul>
  );
}

function formatWindow(start: Date, end: Date): string {
  const lastDay = new Date(new Date(end).getTime() - 1);
  const fmt = (d: Date) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(lastDay)}`;
}

/**
 * Shown above a Page that is a Workspace update's body: what period it covers,
 * where it is in its lifecycle, and — for reviewers — the decision. Nothing is
 * sent until someone with review rights approves it here.
 */
export function UpdateReviewBanner({ pageId }: { pageId: string }) {
  const utils = api.useUtils();
  const { data: update } = api.workspaceUpdate.getForPage.useQuery({ pageId });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refresh = () => {
    void utils.workspaceUpdate.getForPage.invalidate({ pageId });
    void utils.workspaceUpdate.list.invalidate();
  };
  const onError = (err: { message: string }) =>
    notifications.show({ title: 'Could not update', message: err.message, color: 'red' });

  const approve = api.workspaceUpdate.approve.useMutation({
    onSuccess: () => {
      notifications.show({ title: 'Approved', message: 'This update is approved.', color: 'green' });
      refresh();
    },
    onError,
  });
  const skip = api.workspaceUpdate.skip.useMutation({
    onSuccess: () => {
      notifications.show({ title: 'Skipped', message: 'Nothing will be sent for this period.', color: 'gray' });
      refresh();
    },
    onError,
  });
  const regenerate = api.workspaceUpdate.regenerate.useMutation({
    // The editor loads the body once; reload so it shows the rewrite and no
    // stale autosave can overwrite it.
    onSuccess: () => window.location.reload(),
    onError,
  });

  if (!update) return null;
  const isDraft = update.status === 'DRAFT';
  const busy = approve.isPending || skip.isPending || regenerate.isPending;

  return (
    <div
      className="mb-4 rounded-md border border-border-primary bg-surface-secondary px-4 py-3"
      data-testid="update-review-banner"
    >
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="nowrap">
          <IconSparkles size={16} className="text-text-muted" />
          <Text size="sm" className="text-text-primary">
            {update.kind === 'monthly' ? 'Monthly roll-up' : 'Weekly update'} ·{' '}
            {formatWindow(update.windowStart, update.windowEnd)}
          </Text>
          <Badge size="sm" variant="light" color={STATUS_COLOR[update.status] ?? 'gray'}>
            {STATUS_LABEL[update.status] ?? update.status}
          </Badge>
        </Group>
        {isDraft && update.canReview ? (
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPlayerSkipForward size={14} />}
              disabled={busy}
              loading={skip.isPending}
              onClick={() => {
                if (window.confirm('Skip this period? Nothing will be sent for it.')) {
                  skip.mutate({ updateId: update.id });
                }
              }}
            >
              Skip this week
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={14} />}
              disabled={busy}
              onClick={() => setFeedbackOpen((open) => !open)}
            >
              Regenerate
            </Button>
            <Button
              size="xs"
              leftSection={<IconCheck size={14} />}
              disabled={busy}
              loading={approve.isPending}
              onClick={() => approve.mutate({ updateId: update.id, version: update.version })}
            >
              Approve
            </Button>
          </Group>
        ) : null}
      </Group>
      {isDraft && update.canReview && feedbackOpen ? (
        <div className="mt-3">
          <MarkdownInput
            value={feedback}
            onChange={setFeedback}
            placeholder="What should change? e.g. lead with the export fix, shorter, less formal…"
            minRows={2}
            maxRows={6}
          />
          <Group justify="space-between" mt="xs">
            <Text size="xs" className="text-text-muted">
              Rewrites the whole draft from the same shipped work. Your own edits on this page are replaced.
            </Text>
            <Button
              size="xs"
              leftSection={<IconRefresh size={14} />}
              loading={regenerate.isPending}
              onClick={() => regenerate.mutate({ updateId: update.id, feedback: feedback.trim() || undefined })}
            >
              Rewrite draft
            </Button>
          </Group>
        </div>
      ) : null}
      {isDraft ? (
        <Text size="xs" mt={6} className="text-text-muted">
          Edit the draft below as you like. Approving freezes this version for sending; later edits are not sent.
        </Text>
      ) : null}
      <DeliveryList deliveries={update.deliveries} />
    </div>
  );
}
