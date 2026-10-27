'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRestore } from '@tabler/icons-react';
import { format, formatDistanceToNow } from 'date-fns';
import { api } from '~/trpc/react';

interface PageHistoryModalProps {
  pageId: string;
  opened: boolean;
  canEdit: boolean;
  onClose: () => void;
  /** Called after a successful restore, once the page query is fresh. */
  onRestored: () => void | Promise<void>;
}

const KIND_LABEL: Record<string, string> = {
  baseline: 'Baseline',
  create: 'Created',
  editor: 'Edited',
  markdown: 'Written',
  restore: 'Restored',
};

function formatAsOf(value: Date | string | null): string {
  return value ? format(new Date(value), 'd MMM yyyy') : '—';
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

/** Colour one unified-diff line by its first character. */
function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-text-muted';
  if (line.startsWith('@@')) return 'text-text-muted';
  if (line.startsWith('+')) return 'text-brand-success';
  if (line.startsWith('-')) return 'bg-error-bg text-brand-error';
  return 'text-text-secondary';
}

/**
 * A page's history (ADR-0074): every revision, who wrote it and why, the
 * diff each one made, and a way back. Revisions list newest-first on the
 * left; the selected one's unified diff renders on the right, against the
 * revision before it ("what this edit did") or against the page as it is now.
 */
export function PageHistoryModal({
  pageId,
  opened,
  canEdit,
  onClose,
  onRestored,
}: PageHistoryModalProps) {
  const utils = api.useUtils();
  const history = api.page.history.useQuery({ id: pageId }, { enabled: opened });
  const revisions = history.data?.revisions ?? [];
  // Always read history fresh on open: restore pins the page version shown.
  useEffect(() => {
    if (opened) void utils.page.history.invalidate({ id: pageId });
  }, [opened, pageId, utils]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [against, setAgainst] = useState<'previous' | 'current'>('previous');
  // Land on the newest revision when the list arrives / the modal reopens.
  useEffect(() => {
    if (!opened) return;
    if (!selectedId && revisions.length) setSelectedId(revisions[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, revisions.length]);
  useEffect(() => {
    if (!opened) setSelectedId(null);
  }, [opened]);

  const selected = revisions.find((r) => r.id === selectedId) ?? null;
  const isLatest = selected !== null && revisions[0]?.id === selected.id;
  const diff = api.page.diff.useQuery(
    { id: pageId, revisionId: selectedId ?? '', against },
    { enabled: opened && !!selectedId },
  );

  const restore = api.page.restore.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.page.get.invalidate({ id: pageId }),
        utils.page.history.invalidate({ id: pageId }),
        utils.page.list.invalidate(),
      ]);
      notifications.show({ color: 'green', message: 'Page restored' });
      await onRestored();
      onClose();
    },
    onError: (error) =>
      notifications.show({ color: 'red', title: 'Could not restore', message: error.message }),
  });

  const diffLines = useMemo(() => (diff.data?.unified ?? '').split('\n'), [diff.data?.unified]);

  return (
    <Modal opened={opened} onClose={onClose} title="Page history" size="xl" centered>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <ScrollArea.Autosize mah={480} type="auto">
          {history.isLoading ? (
            <Stack gap="xs">
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </Stack>
          ) : revisions.length === 0 ? (
            <Text size="sm" className="text-text-muted">
              No revisions yet.
            </Text>
          ) : (
            <Stack gap={4} data-testid="page-history-list">
              {revisions.map((r, index) => {
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`rounded-md px-2 py-1.5 text-left transition-colors ${
                      active ? 'bg-surface-secondary' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <Group gap={6} wrap="nowrap">
                      {r.kind !== 'baseline' ? (
                        <Avatar src={r.author?.image ?? null} size={18} radius="xl">
                          {r.author?.name?.[0] ?? '?'}
                        </Avatar>
                      ) : null}
                      <Text size="sm" className="truncate text-text-primary">
                        {r.kind === 'baseline'
                          ? 'Before history'
                          : r.authorHidden
                            ? 'A member'
                            : r.author?.name ?? 'Automated'}
                      </Text>
                      <Badge size="xs" variant="light" color={r.kind === 'restore' ? 'yellow' : 'gray'}>
                        {index === 0 ? 'Current' : KIND_LABEL[r.kind] ?? r.kind}
                      </Badge>
                    </Group>
                    <Tooltip label={format(new Date(r.updatedAt), 'PPpp')} withArrow openDelay={400}>
                      <Text size="xs" className="mt-0.5 text-text-muted">
                        {formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })} · v
                        {r.docVersion} · {bytesLabel(r.bodyBytes)}
                      </Text>
                    </Tooltip>
                    {r.note ? (
                      <Text size="xs" className="mt-0.5 text-text-secondary">
                        {r.note}
                      </Text>
                    ) : r.kind === 'markdown' || r.kind === 'restore' ? (
                      // An agent or CLI write that said nothing about why.
                      <Text size="xs" className="mt-0.5 italic text-text-muted">
                        No reason given
                      </Text>
                    ) : null}
                  </button>
                );
              })}
              {history.data?.nextCursor ? (
                <Text size="xs" className="px-2 text-text-muted">
                  Older revisions are available through the CLI.
                </Text>
              ) : null}
            </Stack>
          )}
        </ScrollArea.Autosize>

        <div className="flex min-h-[320px] flex-col gap-3">
          <Group justify="space-between" wrap="wrap">
            <Group gap="xs">
              <SegmentedControl
                size="xs"
                value={against}
                onChange={(value) => setAgainst(value as 'previous' | 'current')}
                data={[
                  { value: 'previous', label: 'What it changed' },
                  { value: 'current', label: 'Against current' },
                ]}
              />
              {diff.data ? (
                <Text size="xs" className="text-text-muted" data-testid="page-history-stats">
                  <span className="text-brand-success">+{diff.data.stats.added}</span>{' '}
                  <span className="text-brand-error">−{diff.data.stats.removed}</span>
                  {diff.data.titleChanged ? ' · title changed' : ''}
                </Text>
              ) : null}
            </Group>
            {canEdit && selected ? (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconRestore size={14} />}
                disabled={isLatest}
                loading={restore.isPending}
                onClick={() =>
                  restore.mutate({
                    id: pageId,
                    revisionId: selected.id,
                    // The newest revision is the page as this panel shows it;
                    // a save since then makes the restore a CONFLICT.
                    baseVersion: revisions[0]?.docVersion,
                  })
                }
                data-testid="page-history-restore"
              >
                {isLatest ? 'This is the current version' : 'Restore this version'}
              </Button>
            ) : null}
          </Group>
          {selected?.title ? (
            <Text size="sm" className="text-text-secondary">
              <span className="text-text-muted">Title: </span>
              {selected.title}
            </Text>
          ) : null}
          {diff.data?.provenanceChanged ? (
            <Text size="xs" className="text-text-secondary" data-testid="page-history-provenance">
              <span className="text-text-muted">As of: </span>
              {formatAsOf(diff.data.from.asOf)} → {formatAsOf(diff.data.to.asOf)}
              <span className="text-text-muted"> · Source: </span>
              {diff.data.from.source ?? '—'} → {diff.data.to.source ?? '—'}
            </Text>
          ) : null}
          <ScrollArea.Autosize mah={420} type="auto" className="rounded-md border border-border-primary">
            {diff.isLoading ? (
              <Skeleton height={200} />
            ) : !diff.data || diff.data.unified === '' ? (
              <Text size="sm" className="p-3 text-text-muted">
                {diff.data ? 'No changes to the body.' : 'Select a revision.'}
              </Text>
            ) : (
              <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5" data-testid="page-history-diff">
                {diffLines.map((line, i) => (
                  <div key={i} className={diffLineClass(line)}>
                    {line === '' ? ' ' : line}
                  </div>
                ))}
              </pre>
            )}
          </ScrollArea.Autosize>
        </div>
      </div>
    </Modal>
  );
}
