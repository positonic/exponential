'use client';

import { notifications } from '@mantine/notifications';
import { api, type RouterOutputs } from '~/trpc/react';

type QaTicketStatus = RouterOutputs['inbox']['waitingOnMe']['qaTickets'][number]['status'];

/**
 * Sets the status of one or many tickets listed on the "Waiting on me" tab,
 * through `product.ticket.bulkUpdate` (the same activity events, completedAt
 * and Notion push as the detail page's single-ticket edit).
 *
 * The new status lands on the tab's rows at once so the pill changes under
 * the user's cursor. The list itself is not refetched here: the inbox's
 * shared after-mutation refetch (`useInboxCounts`) picks the change up a
 * beat later, at which point a ticket moved out of QA leaves the list and
 * the badge count drops.
 */
export function useSetTicketStatus(startOfToday: Date) {
  const utils = api.useUtils();
  const input = { startOfToday };

  return api.product.ticket.bulkUpdate.useMutation({
    onMutate: async ({ ids, status }) => {
      await utils.inbox.waitingOnMe.cancel(input);
      const prev = utils.inbox.waitingOnMe.getData(input);
      // Each moved row's status before this change, so a failure restores
      // only what this change wrote.
      const before = new Map<string, QaTicketStatus>();
      if (prev && status) {
        const moving = new Set(ids);
        utils.inbox.waitingOnMe.setData(input, {
          ...prev,
          qaTickets: prev.qaTickets.map((t) => {
            if (!moving.has(t.id)) return t;
            before.set(t.id, t.status);
            return { ...t, status };
          }),
        });
      }
      return { before };
    },
    onError: (_err, { ids, status }, ctx) => {
      // Per ticket, and only where the row still shows this change's status:
      // a later change to the same row is its own to keep or roll back.
      const cur = utils.inbox.waitingOnMe.getData(input);
      if (cur && ctx?.before.size) {
        utils.inbox.waitingOnMe.setData(input, {
          ...cur,
          qaTickets: cur.qaTickets.map((t) => {
            const was = ctx.before.get(t.id);
            return was !== undefined && t.status === status ? { ...t, status: was } : t;
          }),
        });
      }
      // Overlapping changes that fail out of order can still leave a row on
      // an unsaved value; the refetch settles every row on the server's.
      void utils.inbox.waitingOnMe.invalidate(input);
      notifications.show({
        title: 'Status not changed',
        message:
          ids.length === 1
            ? 'The ticket kept its status. Please try again.'
            : `None of the ${ids.length} tickets changed status. Please try again.`,
        color: 'red',
      });
    },
    onSuccess: () => {
      // Ticket pages and lists cached elsewhere in the session are now stale.
      void utils.product.ticket.invalidate();
    },
  });
}
