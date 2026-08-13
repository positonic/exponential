'use client';

import Link from 'next/link';
import { Skeleton, UnstyledButton } from '@mantine/core';
import { IconRepeat, IconTicket } from '@tabler/icons-react';
import { api, type RouterOutputs } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { STATUS_LABELS } from '~/lib/ticket-statuses';
import {
  statusCss,
  ticketDisplayId,
} from '~/app/_components/product/overview/overviewShared';

type CycleData = RouterOutputs['yourWork']['currentCycles'][number];

const DAY = 24 * 60 * 60 * 1000;

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * One current cycle: countdown, done-vs-time progress (the time marker on the
 * track shows whether completion is keeping pace with the calendar, same
 * pace thresholds as the product overview's CycleHero), the cycle goal, and
 * the caller's tickets in it. Tier 2 of the daily home — "what am I
 * committed to".
 */
function SingleCycle({ cycle }: { cycle: CycleData }) {
  const { workspaceSlug } = useWorkspace();
  const now = Date.now();

  const end = cycle.endDate ? new Date(cycle.endDate).getTime() : null;
  const start = cycle.startDate ? new Date(cycle.startDate).getTime() : null;
  const daysLeft = end !== null ? Math.ceil((end - now) / DAY) : null;
  const over = daysLeft !== null && daysLeft < 0;

  const donePct =
    cycle.committed > 0
      ? Math.min(100, Math.max(0, (cycle.completed / cycle.committed) * 100))
      : 0;
  const timePct =
    start !== null && end !== null && end > start
      ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
      : null;
  const pace =
    timePct === null
      ? null
      : donePct >= timePct + 15
        ? 'ahead'
        : donePct + 1 >= timePct
          ? 'ontrack'
          : 'behind';

  const unit = cycle.usesPoints ? 'pts' : 'tickets';
  const range =
    cycle.startDate && cycle.endDate
      ? `${fmtDate(cycle.startDate)} – ${fmtDate(cycle.endDate)}`
      : null;

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconRepeat size={14} stroke={1.8} />
          {cycle.name}
          {range && <span className="wsa-card__count">{range}</span>}
        </h2>
        {daysLeft !== null && (
          <span
            className={
              over ? 'wsa-cycle__days wsa-cycle__days--over' : 'wsa-cycle__days'
            }
          >
            {over
              ? `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'day' : 'days'} over`
              : daysLeft === 0
                ? 'Last day'
                : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
          </span>
        )}
      </div>

      {cycle.cycleGoal && <p className="wsa-cycle__goal">{cycle.cycleGoal}</p>}

      {cycle.committed > 0 && (
        <>
          <div className="wsa-cycle__track">
            <div className="wsa-cycle__fill" style={{ width: `${donePct}%` }} />
            {timePct !== null && (
              <div
                className="wsa-cycle__timemark"
                style={{ left: `${timePct}%` }}
                title={`${Math.round(timePct)}% of the cycle has elapsed`}
              />
            )}
          </div>
          <div
            className={
              pace === 'ahead'
                ? 'wsa-cycle__pace wsa-cycle__pace--ahead'
                : pace === 'behind'
                  ? 'wsa-cycle__pace wsa-cycle__pace--behind'
                  : 'wsa-cycle__pace'
            }
          >
            {cycle.completed} of {cycle.committed} {unit} done
            {pace === 'ahead' && (
              <>
                {' '}
                — <b>ahead of pace</b>
              </>
            )}
            {pace === 'ontrack' && (
              <>
                {' '}
                — <b>on pace</b>
              </>
            )}
            {pace === 'behind' && (
              <>
                {' '}
                — <b>behind pace</b>
              </>
            )}
          </div>
        </>
      )}

      {cycle.myTickets.length > 0 ? (
        <>
          <div className="wsa-sub">
            <span className="wsa-sub__label">
              Yours in this cycle
              {cycle.myOpenCount > 0 && (
                <span className="wsa-card__count">{cycle.myOpenCount} open</span>
              )}
            </span>
          </div>
          {cycle.myTickets.map((ticket) => (
            <UnstyledButton
              key={ticket.id}
              component={Link}
              href={`/w/${workspaceSlug}/products/${ticket.product.slug}/tickets/${ticket.id}`}
              className="wsa-item"
            >
              <span className="wsa-item__icon">
                <IconTicket size={14} stroke={1.75} />
              </span>
              <span className="wsa-item__label">
                {ticket.title}
                <span className="wsa-item__sub">
                  {ticketDisplayId(ticket.product, ticket)}
                </span>
              </span>
              <span className="wsa-item__meta">
                <span
                  className="wsa-item__chip"
                  style={{ color: statusCss(ticket.status) }}
                >
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
              </span>
            </UnstyledButton>
          ))}
        </>
      ) : (
        <p className="wsa-card__caption" style={{ marginTop: 10 }}>
          Nothing assigned to you in this cycle.
        </p>
      )}
    </section>
  );
}

/**
 * The current cycle block(s) for the workspace — usually one card, one per
 * parallel team cycle otherwise. Hidden entirely when the workspace runs no
 * cycles, so non-sprint workspaces never see an empty shell.
 */
export function CycleCards() {
  const { workspaceId } = useWorkspace();
  const { data: cycles, isLoading } = api.yourWork.currentCycles.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  if (isLoading) return <Skeleton height={120} radius={12} />;
  if (!cycles || cycles.length === 0) return null;

  return (
    <>
      {cycles.map((cycle) => (
        <SingleCycle key={cycle.id} cycle={cycle} />
      ))}
    </>
  );
}
