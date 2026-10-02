'use client';

import Link from 'next/link';
import { Badge, Button, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileText, IconSparkles } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { SettingsSection } from './SettingsShell';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'yellow',
  APPROVED: 'green',
  SENT: 'green',
  SKIPPED: 'gray',
  EMPTY: 'gray',
};

/**
 * Workspace settings → Updates: the resident copywriter that drafts a curated
 * update each period for a reviewer to approve. Owners and admins only.
 */
export function WorkspaceUpdatesSettings({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const utils = api.useUtils();
  const { data: recent } = api.workspaceUpdate.list.useQuery({ workspaceId, limit: 5 });

  const generateNow = api.workspaceUpdate.generateNow.useMutation({
    onSuccess: (result) => {
      void utils.workspaceUpdate.list.invalidate();
      if (result.kind === 'drafted') {
        notifications.show({
          title: 'Draft ready',
          message: 'Open it below to review, edit and approve.',
          color: 'green',
        });
      } else if (result.kind === 'empty') {
        notifications.show({
          title: 'Nothing to write about',
          message: 'Nothing user-facing shipped since the last update.',
          color: 'yellow',
        });
      }
    },
    onError: (err) =>
      notifications.show({ title: 'Could not draft an update', message: err.message, color: 'red' }),
  });

  return (
    <SettingsSection
      icon={IconSparkles}
      title="Updates"
      description="A resident copywriter drafts a short update of what shipped each week. You review and approve it; nothing is sent without approval."
      action={
        <Button
          size="xs"
          variant="light"
          loading={generateNow.isPending}
          onClick={() => generateNow.mutate({ workspaceId })}
        >
          Generate draft now
        </Button>
      }
    >
      <Text size="xs" fw={600} className="mb-2 uppercase tracking-wide text-text-muted">
        Recent updates
      </Text>
      {recent && recent.length > 0 ? (
        <ul className="m-0 list-none space-y-1.5 p-0">
          {recent.map((update) => (
            <li key={update.id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <IconFileText size={14} className="shrink-0 text-text-muted" />
                {update.pageId ? (
                  <Link
                    href={`/w/${workspaceSlug}/pages/${update.pageId}`}
                    className="truncate text-sm text-text-primary hover:underline"
                  >
                    {update.page?.title ?? 'Update'}
                  </Link>
                ) : (
                  <span className="truncate text-sm text-text-muted">
                    Nothing shipped ·{' '}
                    {new Date(update.windowEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </span>
              <Badge size="xs" variant="light" color={STATUS_COLOR[update.status] ?? 'gray'}>
                {update.status.toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <Text size="sm" className="text-text-muted">
          No updates yet. Generate a draft to see what the copywriter writes.
        </Text>
      )}
    </SettingsSection>
  );
}
