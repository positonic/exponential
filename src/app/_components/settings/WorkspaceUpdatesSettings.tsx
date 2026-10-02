'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Badge, Button, MultiSelect, Select, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileText, IconSparkles } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { SettingsField, SettingsSection } from './SettingsShell';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'yellow',
  APPROVED: 'green',
  SENT: 'green',
  SKIPPED: 'gray',
  EMPTY: 'gray',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_OPTIONS = WEEKDAYS.map((label, value) => ({ value: String(value), label }));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return Array.from(new Set(['UTC', current, ...zones]));
}

interface Member {
  userId: string;
  role: string;
  user: { name: string | null; email: string | null };
}

/**
 * Workspace settings → Updates: the resident copywriter that drafts a curated
 * update each week for a reviewer to approve. Owners and admins only.
 */
export function WorkspaceUpdatesSettings({
  workspaceId,
  workspaceSlug,
  members,
}: {
  workspaceId: string;
  workspaceSlug: string;
  members: Member[];
}) {
  const utils = api.useUtils();
  const { data: config } = api.workspaceUpdate.getConfig.useQuery({ workspaceId });
  const { data: recent } = api.workspaceUpdate.list.useQuery({ workspaceId, limit: 5 });
  const { data: assistants } = api.assistant.list.useQuery({ workspaceId });

  const onError = (err: { message: string }) =>
    notifications.show({ title: 'Could not save', message: err.message, color: 'red' });

  const updateConfig = api.workspaceUpdate.updateConfig.useMutation({
    onSuccess: () => void utils.workspaceUpdate.getConfig.invalidate({ workspaceId }),
    onError,
  });
  const save = (patch: Omit<Parameters<typeof updateConfig.mutate>[0], 'workspaceId'>) =>
    updateConfig.mutate({ workspaceId, ...patch });

  const generateNow = api.workspaceUpdate.generateNow.useMutation({
    onSuccess: (result) => {
      void utils.workspaceUpdate.list.invalidate();
      if (result.kind === 'drafted') {
        notifications.show({
          title: 'Draft ready',
          message: 'Reviewers have been sent it. Open it below to review, edit and approve.',
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

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.userId,
        label: m.user.name ?? m.user.email ?? 'Unknown member',
      })),
    [members],
  );
  const zones = useMemo(() => timeZoneOptions(config?.timezone ?? 'UTC'), [config?.timezone]);

  if (!config) return null;

  return (
    <>
      <SettingsSection
        icon={IconSparkles}
        title="Updates"
        description="A resident copywriter drafts a short update of what shipped each week and sends it to your reviewers. Nothing goes out until a reviewer approves it."
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
        <SettingsField label="Weekly draft" sublabel="Draft an update automatically every week">
          <Switch
            checked={config.enabled}
            onChange={(e) => save({ enabled: e.currentTarget.checked })}
            aria-label="Draft an update every week"
          />
        </SettingsField>
        <SettingsField label="When" sublabel="The draft covers everything since the previous one">
          <div className="flex flex-wrap gap-2">
            <Select
              size="xs"
              w={140}
              data={WEEKDAY_OPTIONS}
              value={String(config.weekday)}
              onChange={(v) => v && save({ weekday: Number(v) })}
              allowDeselect={false}
              aria-label="Day of the week"
            />
            <Select
              size="xs"
              w={100}
              data={HOUR_OPTIONS}
              value={String(config.hour)}
              onChange={(v) => v && save({ hour: Number(v) })}
              allowDeselect={false}
              aria-label="Time of day"
            />
            <Select
              size="xs"
              w={220}
              searchable
              data={zones}
              value={config.timezone}
              onChange={(v) => v && save({ timezone: v })}
              allowDeselect={false}
              aria-label="Time zone"
            />
          </div>
        </SettingsField>
        <SettingsField label="Reviewers" sublabel="Get each draft by Matrix and email. Empty means owners and admins">
          <MultiSelect
            size="xs"
            data={memberOptions}
            value={config.reviewerIds}
            onChange={(ids) => save({ reviewerIds: ids })}
            placeholder={config.reviewerIds.length ? undefined : 'Owners and admins'}
            searchable
            clearable
          />
        </SettingsField>
        <SettingsField label="Voice" sublabel="Write in the personality of one of your assistants">
          <Select
            size="xs"
            data={(assistants ?? []).map((a) => ({ value: a.id, label: `${a.emoji ?? ''} ${a.name}`.trim() }))}
            value={config.assistantId}
            onChange={(v) => save({ assistantId: v })}
            placeholder="Neutral house voice"
            clearable
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection icon={IconFileText} title="Recent updates">
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
    </>
  );
}
