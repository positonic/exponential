'use client';

import { useState } from 'react';
import { Button, PasswordInput, Progress } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconGauge, IconKey } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { Pill } from '~/app/_components/ui';
import { SettingsField, SettingsSection } from './SettingsShell';

/** The month's count starts again at midnight UTC on the 1st, so the date is shown in UTC for everyone. */
function formatResetDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Yellow from 80% of the allowance, red once it is used up. */
function barColor(warnLevel: 80 | 100 | null): string | undefined {
  if (warnLevel === 100) return 'red';
  if (warnLevel === 80) return 'yellow';
  return undefined;
}

/**
 * Workspace settings → Billing. Owners and admins only, and only on an install
 * that meters Assistant use (`BILLING_MODE`); everywhere else it renders
 * nothing and the settings page lists no Billing tab.
 */
export function BillingSettings({ workspaceId }: { workspaceId: string }) {
  const { data: status } = api.billing.getStatus.useQuery({ workspaceId });

  if (!status || status.mode === 'off') return null;

  const label = `${status.usedPercent}% of this month's assistant use`;

  return (
    <>
      <SettingsSection
        icon={IconGauge}
        title="Assistant usage"
        description="How much of this month's assistant allowance this workspace has used. Chat with the Assistant and agent runs count. Meeting summaries, search and digests don't."
      >
        <div className="mb-2 text-[13px] font-medium text-text-primary">{label}</div>
        <Progress
          value={Math.min(status.usedPercent, 100)}
          color={barColor(status.warnLevel)}
          size="lg"
          aria-label={label}
        />
        <div className="mt-2 text-xs text-text-muted">
          Starts again on {formatResetDate(status.resetsAt)}.
          {status.mode === 'meter' && ' Nothing is limited yet. This only shows how much the workspace uses.'}
        </div>
      </SettingsSection>
      <ModelKeySection workspaceId={workspaceId} modelKey={status.modelKey} />
    </>
  );
}

/**
 * The workspace's own Anthropic key. The key is typed here once and never
 * comes back: afterwards the server only says what its last four characters
 * are and whether it works.
 */
function ModelKeySection({
  workspaceId,
  modelKey,
}: {
  workspaceId: string;
  modelKey: { last4: string; status: 'valid' | 'failing' } | null;
}) {
  const utils = api.useUtils();
  const [apiKey, setApiKey] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);

  const saveKey = api.billing.saveModelKey.useMutation({
    onSuccess: () => {
      setApiKey('');
      setIsReplacing(false);
      void utils.billing.getStatus.invalidate({ workspaceId });
      notifications.show({
        title: 'Key saved',
        message: 'Anthropic accepted the key. The Assistant in this workspace will run on it.',
        color: 'green',
      });
    },
    onError: (error) =>
      notifications.show({ title: 'Key not saved', message: error.message, color: 'red' }),
  });

  const removeKey = api.billing.removeModelKey.useMutation({
    onSuccess: () => {
      setIsReplacing(false);
      void utils.billing.getStatus.invalidate({ workspaceId });
      notifications.show({
        title: 'Key removed',
        message: 'The Assistant in this workspace is back on the monthly allowance.',
        color: 'green',
      });
    },
    onError: (error) =>
      notifications.show({ title: 'Key not removed', message: error.message, color: 'red' }),
  });

  const showForm = !modelKey || isReplacing;

  return (
    <SettingsSection
      icon={IconKey}
      title="Your own Anthropic key"
      description="Add an Anthropic API key and the Assistant in this workspace runs on it, without counting against the monthly allowance. Anthropic bills you directly for what it uses. The key is stored encrypted and never shown again."
    >
      {modelKey && (
        <SettingsField
          label="Saved key"
          action={
            !isReplacing && (
              <div className="flex gap-2">
                <Button size="xs" variant="default" onClick={() => setIsReplacing(true)}>
                  Replace
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  loading={removeKey.isPending}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: 'Remove this key?',
                      children:
                        'The Assistant in this workspace goes back to the monthly allowance. The key is deleted here; it stays valid at Anthropic until you revoke it there.',
                      labels: { confirm: 'Remove key', cancel: 'Keep it' },
                      confirmProps: { color: 'red' },
                      onConfirm: () => removeKey.mutate({ workspaceId }),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            )
          }
        >
          <span className="mr-2 font-mono text-[12.5px]">Ends in {modelKey.last4}</span>
          <Pill size="xs" tone={modelKey.status === 'failing' ? 'danger' : 'brand'}>
            {modelKey.status === 'failing' ? 'Not working' : 'Working'}
          </Pill>
          {modelKey.status === 'failing' && (
            <div className="mt-1.5 text-xs text-text-muted">
              Anthropic stopped accepting this key, so the Assistant is back on the monthly allowance. Replace the
              key to run on your own again.
            </div>
          )}
        </SettingsField>
      )}
      {showForm && (
        <SettingsField
          label={modelKey ? 'New key' : 'API key'}
          sublabel="Create one in the Anthropic Console under API keys"
        >
          <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (apiKey.trim()) saveKey.mutate({ workspaceId, apiKey: apiKey.trim() });
            }}
          >
            <PasswordInput
              size="xs"
              className="min-w-[240px] flex-1"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              placeholder="sk-ant-..."
              aria-label="Anthropic API key"
              autoComplete="off"
            />
            <Button size="xs" type="submit" loading={saveKey.isPending} disabled={!apiKey.trim()}>
              Check and save
            </Button>
            {isReplacing && (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setIsReplacing(false);
                  setApiKey('');
                }}
              >
                Cancel
              </Button>
            )}
          </form>
        </SettingsField>
      )}
    </SettingsSection>
  );
}
