'use client';

import Link from 'next/link';
import { Skeleton, UnstyledButton } from '@mantine/core';
import {
  IconAt,
  IconBellRinging,
  IconClockExclamation,
  IconTicket,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { NOTIFICATION_CATEGORIES } from '~/server/services/notifications/emit/constants';
import {
  compactAge,
  ticketDisplayId,
} from '~/app/_components/product/overview/overviewShared';

const MAX_ROWS = 5;

/**
 * Tier 1 of the daily home: "Needs your attention" — the only content that is
 * genuinely new each day. Three subsections, each of which vanishes when
 * empty: unread mentions (reading them shrinks the card — that's the reward
 * loop), QA tickets waiting on you to promote (with a "PR merged" chip when
 * the merge webhook has landed), and overdue actions. When all three are
 * empty the whole card disappears.
 */
export function AttentionPanel() {
  const { workspaceId, workspaceSlug } = useWorkspace();
  const utils = api.useUtils();

  // Mentions are user-scoped, not workspace-scoped: a mention follows the
  // person. Only unread ones render here — processed items leave the page.
  // Filtered server-side so any volume of read mentions can't crowd out an
  // unread one (which the badge counts).
  const { data: mentionData, isLoading: mentionsLoading } =
    api.notification.list.useQuery({
      category: NOTIFICATION_CATEGORIES.MENTION,
      unreadOnly: true,
      limit: MAX_ROWS,
    });
  const { data: unreadCount } = api.notification.unreadCount.useQuery({
    category: NOTIFICATION_CATEGORIES.MENTION,
  });
  const invalidateInbox = () => {
    void utils.notification.list.invalidate();
    void utils.notification.unreadCount.invalidate();
  };
  const markRead = api.notification.markRead.useMutation({
    onSuccess: invalidateInbox,
  });
  const markAllRead = api.notification.markAllRead.useMutation({
    onSuccess: invalidateInbox,
  });

  const { data: waiting, isLoading: waitingLoading } =
    api.yourWork.waitingOnYou.useQuery(
      { workspaceId: workspaceId ?? '' },
      { enabled: !!workspaceId },
    );

  // action.getAll is already "mine"-scoped server-side.
  const { data: actions, isLoading: actionsLoading } = api.action.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId },
  );

  if (!workspaceId || !workspaceSlug) return null;

  const unreadMentions = (mentionData?.notifications ?? [])
    .filter((m) => m.readAt === null)
    .slice(0, MAX_ROWS);
  const waitingRows = waiting ?? [];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // status === 'ACTIVE' alone is not enough: legacy rows completed from the
  // kanban board carry kanbanStatus DONE/CANCELLED with status still ACTIVE.
  const overdue = (actions ?? [])
    .filter(
      (a) =>
        a.status === 'ACTIVE' &&
        a.kanbanStatus !== 'DONE' &&
        a.kanbanStatus !== 'CANCELLED' &&
        a.dueDate !== null &&
        new Date(a.dueDate) < startOfToday,
    )
    .sort(
      (a, b) =>
        new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime(),
    )
    .slice(0, MAX_ROWS);

  const isLoading = mentionsLoading || waitingLoading || actionsLoading;
  const total = unreadMentions.length + waitingRows.length + overdue.length;

  if (!isLoading && total === 0) return null;

  return (
    <section className="wsa-card">
      <div className="wsa-card__head">
        <h2 className="wsa-card__title">
          <IconBellRinging size={14} stroke={1.8} />
          Needs your attention
          {total > 0 && <span className="wsa-card__count">{total}</span>}
        </h2>
      </div>

      {isLoading && total === 0 ? (
        <>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={34} mb={4} radius="sm" />
          ))}
        </>
      ) : (
        <>
          {unreadMentions.length > 0 && (
            <>
              <div className="wsa-sub">
                <span className="wsa-sub__label">
                  Mentions
                  <span className="wsa-sub__badge">{unreadCount ?? unreadMentions.length}</span>
                </span>
                <button
                  type="button"
                  className="wsa-sub__action"
                  onClick={() =>
                    markAllRead.mutate({
                      category: NOTIFICATION_CATEGORIES.MENTION,
                    })
                  }
                  disabled={markAllRead.isPending}
                >
                  Mark all read
                </button>
              </div>
              {unreadMentions.map((mention) => {
                const row = (
                  <>
                    <span className="wsa-item__icon">
                      <IconAt size={14} stroke={1.75} />
                    </span>
                    <span className="wsa-item__label wsa-item__label--unread">
                      {mention.title}
                      {mention.message && (
                        <span className="wsa-item__sub">{mention.message}</span>
                      )}
                    </span>
                    <span className="wsa-item__meta">
                      <span className="wsa-item__dot" aria-label="Unread" />
                      {compactAge(mention.createdAt)}
                    </span>
                  </>
                );
                // Opening a mention reads it — mark before navigation unmounts us.
                const readOnOpen = () =>
                  markRead.mutate({ notificationId: mention.id });
                return mention.deeplink ? (
                  <UnstyledButton
                    key={mention.id}
                    component={Link}
                    href={mention.deeplink}
                    className="wsa-item"
                    onClick={readOnOpen}
                  >
                    {row}
                  </UnstyledButton>
                ) : (
                  <UnstyledButton
                    key={mention.id}
                    className="wsa-item"
                    onClick={readOnOpen}
                  >
                    {row}
                  </UnstyledButton>
                );
              })}
            </>
          )}

          {waitingRows.length > 0 && (
            <>
              <div className="wsa-sub">
                <span className="wsa-sub__label">Waiting on you</span>
              </div>
              {waitingRows.map((ticket) => (
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
                      {ticketDisplayId(ticket.product, ticket)} · in QA
                    </span>
                  </span>
                  <span className="wsa-item__meta">
                    {ticket.prMerged && (
                      <span className="wsa-item__chip wsa-item__chip--go">
                        PR merged — promote?
                      </span>
                    )}
                    {compactAge(ticket.updatedAt)}
                  </span>
                </UnstyledButton>
              ))}
            </>
          )}

          {overdue.length > 0 && (
            <>
              <div className="wsa-sub">
                <span className="wsa-sub__label">Overdue</span>
              </div>
              {overdue.map((action) => (
                <UnstyledButton
                  key={action.id}
                  component={Link}
                  href={`/w/${workspaceSlug}/actions/${action.id}`}
                  className="wsa-item"
                >
                  <span className="wsa-item__icon">
                    <IconClockExclamation size={14} stroke={1.75} />
                  </span>
                  <span className="wsa-item__label">
                    {action.name}
                    {action.project && (
                      <span className="wsa-item__sub">{action.project.name}</span>
                    )}
                  </span>
                  <span className="wsa-item__meta">
                    <span className="wsa-item__chip wsa-item__chip--warn">
                      {action.dueDate
                        ? `due ${compactAge(action.dueDate)} ago`
                        : 'overdue'}
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
