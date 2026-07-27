'use client';

import { useEffect, useRef } from 'react';
import { Button, Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles } from '@tabler/icons-react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { api } from '~/trpc/react';

/**
 * Workspace roles allowed to trigger enrichment. Mirrors the server-side
 * gate on `crmContact.enrichNow` (owner/admin/member) — viewers and guests
 * are refused. This is UX only; the server still enforces it.
 */
const EDITOR_ROLES = ['owner', 'admin', 'member'] as const;

/** A job is "in flight" (worth polling) while pending or running. */
function isInFlight(status: string | null | undefined): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

interface EnrichContactButtonProps {
  contactId: string;
  /**
   * How to render the control:
   * - `button` — a labeled Mantine Button (drawer footer / detail view).
   * - `menu-item` — a Menu.Item for the contacts-list row action menu.
   */
  variant?: 'button' | 'menu-item';
  /** Called after enrichment completes so callers can refetch derived data. */
  onCompleted?: () => void;
}

/**
 * "Enrich" control for a single CRM contact. Queues a web-search enrichment
 * job and honestly reflects the cron-drained latency: it polls job status
 * only while PENDING/RUNNING, disables itself in flight, and refetches the
 * contact on completion so newly-filled fields appear.
 *
 * Renders nothing for read-only roles (viewer/guest/null).
 */
export function EnrichContactButton({
  contactId,
  variant = 'button',
  onCompleted,
}: EnrichContactButtonProps) {
  const { userRole } = useWorkspace();
  const utils = api.useUtils();
  const isEditor =
    userRole !== null &&
    (EDITOR_ROLES as readonly string[]).includes(userRole);

  const statusQuery = api.crmContact.getEnrichmentStatus.useQuery(
    { contactId },
    {
      enabled: isEditor,
      // Poll only while a job is in flight; stop otherwise.
      refetchInterval: (query) =>
        isInFlight(query.state.data?.status) ? 5000 : false,
    },
  );

  const status = statusQuery.data?.status ?? null;
  const inFlight = isInFlight(status);

  // Track the last observed status so we can fire side effects on transitions
  // (COMPLETED → refetch + success toast, FAILED → error toast) exactly once.
  const prevStatusRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    // Skip the very first observation (mount) so we don't toast an already-
    // finished historical job.
    if (prev !== undefined && prev !== status) {
      if (status === 'COMPLETED' && isInFlight(prev)) {
        void utils.crmContact.getById.invalidate({ id: contactId });
        void utils.crmContact.getAll.invalidate();
        notifications.show({
          title: 'Enrichment complete',
          message: 'Contact enriched. Review the AI-sourced fields.',
          color: 'green',
        });
        onCompleted?.();
      } else if (status === 'FAILED' && isInFlight(prev)) {
        notifications.show({
          title: 'Enrichment failed',
          message: statusQuery.data?.error ?? 'The enrichment job failed.',
          color: 'red',
        });
      }
    }
    prevStatusRef.current = status;
  }, [status, contactId, utils, onCompleted, statusQuery.data?.error]);

  const enrichNow = api.crmContact.enrichNow.useMutation({
    onSuccess: (result) => {
      if (result.enqueued) {
        void statusQuery.refetch();
        notifications.show({
          title: 'Enrichment queued',
          message: 'Searching the web — this can take a few minutes.',
          color: 'blue',
        });
      } else if (result.reason === 'already-in-flight') {
        void statusQuery.refetch();
        notifications.show({
          title: 'Already enriching',
          message: 'This contact is already being enriched.',
          color: 'yellow',
        });
      } else if (result.reason === 'auto-enrich-disabled') {
        notifications.show({
          title: 'Enrichment unavailable',
          message: 'Enrichment is disabled for this workspace.',
          color: 'yellow',
        });
      }
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    },
  });

  if (!isEditor) return null;

  const busy = enrichNow.isPending || inFlight;
  const label = inFlight ? 'Enriching…' : 'Enrich';

  const handleClick = () => {
    if (busy) return;
    enrichNow.mutate({ contactId });
  };

  if (variant === 'menu-item') {
    return (
      <Menu.Item
        leftSection={<IconSparkles size={14} />}
        disabled={busy}
        closeMenuOnClick={false}
        onClick={handleClick}
      >
        {label}
      </Menu.Item>
    );
  }

  return (
    <Button
      variant="light"
      color="brand"
      size="sm"
      leftSection={<IconSparkles size={16} />}
      loading={busy}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}
