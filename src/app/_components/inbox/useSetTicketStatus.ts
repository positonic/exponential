'use client';

import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

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
      if (prev && status) {
        const moving = new Set(ids);
        utils.inbox.waitingOnMe.setData(input, {
          ...prev,
          qaTickets: prev.qaTickets.map((t) =>
            moving.has(t.id) ? { ...t, status } : t,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, { ids }, ctx) => {
      if (ctx?.prev) utils.inbox.waitingOnMe.setData(input, ctx.prev);
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
