'use client';

import Link from 'next/link';
import { Skeleton, UnstyledButton } from '@mantine/core';
import {
  IconSquareRoundedCheck,
  IconSun,
  IconTicket,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { STATUS_LABELS } from '~/lib/ticket-statuses';
import {
  statusCss,
  ticketDisplayId,
} from '~/app/_components/product/overview/overviewShared';

const MAX_ROWS = 6;

/**
 * Tier 2 of the daily home, alongside the cycle card: actions due today or
 * this week, plus open tickets assigned to the caller that are NOT in a
 * current cycle (in-cycle tickets already render in the cycle card — this
 * panel dedupes against it so nothing appears twice). Overdue actions belong
 * to the attention tier, not here. Hidden when empty.
 */
export function TodayPanel() {
  const { workspaceId, workspaceSlug } = useWorkspace();

  const { data: actions, isLoading: actionsLoading } = api.action.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );
  const { data: tickets, isLoading: ticketsLoading } =
    api.yourWork.assignedTickets.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );
  // Same query the cycle card runs — React Query dedupes, so this costs
  // nothing extra and lets us hide tickets the cycle card already shows.
  const { data: cycles } = api.yourWork.currentCycles.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId },
  );

  if (!workspaceId || !workspaceSlug) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const weekOut = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const active = (actions ?? []).filter(
    (a) => a.status === 'ACTIVE' && a.dueDate !== null,
  );
  const dueToday = active.filter((a) => {
    const due = new Date(a.dueDate ?? 0);
    return due >= startOfToday && due < startOfTomorrow;
  });
  const dueThisWeek = active.filter((a) => {
    const due = new Date(a.dueDate ?? 0);
    return due >= startOfTomorrow && due < weekOut;
  });

  const cycleIds = new Set((cycles ?? []).map((c) => c.id));
  const outOfCycleTickets = (tickets ?? [])
    .filter((t) => t.cycleId === null || !cycleIds.has(t.cycleId))
    .slice(0, MAX_ROWS);

  const actionRows = [...dueToday, ...dueThisWeek].slice(0, MAX_ROWS);
  const isLoading = actionsLoading || ticketsLoading;
  const total = actionRows.length + outOfCycleTickets.length;

  if (!isLoading && total === 0) return null;

  const dueLabel = (dueDate: Date) =>
    dueDate < startOfTomorrow
      ? 'today'
      : dueDate.toLocaleDateString('en-US', { weekday: 'short' });

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconSun size={14} stroke={1.8} />
          On your plate
          {total > 0 && <span className="wsa-card__count">{total}</span>}
        </h2>
        <Link href={`/w/${workspaceSlug}/actions`} className="wsa-sub__action">
          View all →
        </Link>
      </div>

      {isLoading && total === 0 ? (
        <>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={34} mb={4} radius="sm" />
          ))}
        </>
      ) : (
        <>
          {actionRows.map((action) => (
            <UnstyledButton
              key={action.id}
              component={Link}
              href={`/w/${workspaceSlug}/actions/${action.id}`}
              className="wsa-item"
            >
              <span className="wsa-item__icon">
                <IconSquareRoundedCheck size={14} stroke={1.75} />
              </span>
              <span className="wsa-item__label">
                {action.name}
                {action.project && (
                  <span className="wsa-item__sub">{action.project.name}</span>
                )}
              </span>
              <span className="wsa-item__meta">
                {action.dueDate && dueLabel(new Date(action.dueDate))}
              </span>
            </UnstyledButton>
          ))}

          {outOfCycleTickets.length > 0 && (
            <>
              <div className="wsa-sub">
                <span className="wsa-sub__label">Your open tickets</span>
              </div>
              {outOfCycleTickets.map((ticket) => (
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
          )}
        </>
      )}
    </section>
  );
}
