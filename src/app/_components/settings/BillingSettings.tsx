'use client';

import { Progress } from '@mantine/core';
import { IconGauge } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { SettingsSection } from './SettingsShell';

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
  );
}
