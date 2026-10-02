'use client';

import { Badge, Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconSparkles } from '@tabler/icons-react';
import { api } from '~/trpc/react';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft, waiting for approval',
  APPROVED: 'Approved',
  SENT: 'Sent',
  SKIPPED: 'Skipped',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'yellow',
  APPROVED: 'green',
  SENT: 'green',
  SKIPPED: 'gray',
};

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

  if (!update) return null;
  const isDraft = update.status === 'DRAFT';

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
              leftSection={<IconCheck size={14} />}
              loading={approve.isPending}
              onClick={() => approve.mutate({ updateId: update.id })}
            >
              Approve
            </Button>
          </Group>
        ) : null}
      </Group>
      {isDraft ? (
        <Text size="xs" mt={6} className="text-text-muted">
          Edit the draft below as you like. Nothing is sent until a reviewer approves it.
        </Text>
      ) : null}
    </div>
  );
}
