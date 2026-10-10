'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Loader, Skeleton, UnstyledButton } from '@mantine/core';
import { IconHourglass, IconRobot } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import type { RouterOutputs } from '~/trpc/react';
import { compactAge } from '~/app/_components/product/overview/overviewShared';
import { toPlainText } from '~/lib/content/plainText';

type Run = RouterOutputs['inbox']['delegated']['live'][number];

function withWorkspace(workspace: { slug: string; name: string } | null, detail: string): string {
  return workspace ? `${workspace.name} · ${detail}` : detail;
}

function actionHref(run: Run): string {
  return run.action.workspace ? `/w/${run.action.workspace.slug}/actions/${run.action.id}` : '/inbox?tab=delegated';
}

function assistantLabel(run: Run): string {
  const name = run.agent.emoji ? `${run.agent.emoji} ${run.agent.name}` : run.agent.name;
  return run.isOwner ? name : `${name} (a teammate's assistant)`;
}

function duration(run: Run): string {
  const start = run.startedAt ?? run.createdAt;
  const end = run.finishedAt ?? run.lastEventAt ?? new Date();
  const s = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Section({ label, shown, total, children }: { label: string; shown: number; total: number; children: ReactNode }) {
  if (total === 0) return null;
  return (
    <>
      <div className="wsa-sub">
        <span className="wsa-sub__label">
          {label}
          <span className="wsa-sub__badge">{total}</span>
        </span>
        {total > shown && <span className="wsa-item__meta">Showing {shown} of {total}</span>}
      </div>
      {children}
    </>
  );
}

function Row({ run, icon, sub, meta }: { run: Run; icon: ReactNode; sub: string; meta: ReactNode }) {
  return (
    <UnstyledButton component={Link} href={actionHref(run)} className="wsa-item" data-testid={`delegated-row-${run.id}`} data-status={run.status}>
      <span className="wsa-item__icon">{icon}</span>
      <span className="wsa-item__label">
        {toPlainText(run.action.name)}
        <span className="wsa-item__sub">{sub}</span>
      </span>
      <span className="wsa-item__meta">{meta}</span>
    </UnstyledButton>
  );
}

/**
 * The inbox's Delegated tab (ADR-0067): actions handed to an Assistant, each
 * with its latest run. Live rows are a signal ("Aria · working 1m"), waiting
 * rows need a reply on the action, finished rows carry the summary and clear
 * by reviewing them. Scoped to runs you requested or your own Assistant ran.
 */
export function DelegatedTab() {
  const { data, isLoading } = api.inbox.delegated.useQuery(undefined, {
    // Live rows move; poll only while there are any.
    refetchInterval: (query) => ((query.state.data?.counts.live ?? 0) > 0 ? 5000 : false),
  });

  if (isLoading || !data) {
    return (
      <section className="wsa-card">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={40} mb={4} radius="sm" />
        ))}
      </section>
    );
  }

  const { counts } = data;
  if (counts.live + counts.waiting + counts.unreviewed + data.reviewed.length === 0) {
    return (
      <section className="wsa-card">
        <p className="wsa-feed__empty">
          Nothing is delegated. Assign an action to your assistant and it shows up here while it works.
        </p>
      </section>
    );
  }

  return (
    <section className="wsa-card" data-testid="delegated-tab">
      <Section label="Working" shown={data.live.length} total={counts.live}>
        {data.live.map((run) => (
          <Row
            key={run.id}
            run={run}
            icon={<Loader size={14} />}
            sub={withWorkspace(run.action.workspace, `${assistantLabel(run)} · ${run.status === 'QUEUED' ? 'queued' : `working ${duration(run)}`}`)}
            meta={<span className="wsa-item__chip">{run.toolCallCount} tool{run.toolCallCount === 1 ? '' : 's'}</span>}
          />
        ))}
      </Section>

      <Section label="Waiting on you" shown={data.waiting.length} total={counts.waiting}>
        {data.waiting.map((run) => (
          <Row
            key={run.id}
            run={run}
            icon={<IconHourglass size={14} stroke={1.75} />}
            sub={withWorkspace(run.action.workspace, `${assistantLabel(run)} asked a question — reply on the action`)}
            meta={<span className="wsa-item__chip wsa-item__chip--warn">waiting</span>}
          />
        ))}
      </Section>

      <Section label="Finished" shown={data.unreviewed.length} total={counts.unreviewed}>
        {data.unreviewed.map((run) => (
          <Row
            key={run.id}
            run={run}
            icon={<IconRobot size={14} stroke={1.75} />}
            sub={withWorkspace(
              run.action.workspace,
              run.status === 'SUCCEEDED'
                ? (run.summary ? `${assistantLabel(run)}: ${run.summary.split('\n')[0]}` : `${assistantLabel(run)} finished`)
                : `${assistantLabel(run)} stopped (${run.status.toLowerCase().replace('_', ' ')})`,
            )}
            meta={
              <>
                {run.readyToClose && <span className="wsa-item__chip wsa-item__chip--go">ready to close</span>}
                {run.finishedAt ? compactAge(run.finishedAt) : null}
              </>
            }
          />
        ))}
      </Section>

      <Section label="Reviewed this week" shown={data.reviewed.length} total={data.reviewed.length}>
        {data.reviewed.map((run) => (
          <Row
            key={run.id}
            run={run}
            icon={<IconRobot size={14} stroke={1.75} />}
            sub={withWorkspace(run.action.workspace, `${assistantLabel(run)} · reviewed`)}
            meta={run.reviewedAt ? compactAge(run.reviewedAt) : null}
          />
        ))}
      </Section>
    </section>
  );
}
