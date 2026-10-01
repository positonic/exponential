"use client";

import { useRef } from "react";
import { notifications } from "@mantine/notifications";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  useTicketSummaryCache,
  withBlockedFlag,
  type TicketSummary,
} from "~/app/_components/product/useTicketSummaryCache";

type TicketDetail = NonNullable<RouterOutputs["product"]["ticket"]["getById"]>;
type TicketTagRow = TicketDetail["tags"][number];

/**
 * The option lists a property edit picks from. Relations are rebuilt from
 * these so an optimistic patch renders the new name/colour, not just the id.
 */
interface TicketPropertyLookups {
  productId?: string;
  members: Array<{
    user: { id: string; name: string | null; email?: string | null; image?: string | null };
  }>;
  features?: Array<NonNullable<TicketDetail["feature"]>>;
  epics?: Array<NonNullable<TicketDetail["epic"]>>;
  cycles?: Array<{
    id: string;
    name: string;
    status: NonNullable<TicketSummary["cycle"]>["status"];
    startDate: Date | null;
    endDate: Date | null;
  }>;
  tags?: Array<TicketTagRow["tag"]>;
}

/**
 * Ticket property edits (status, assignee, cycle, labels, …) that land in the
 * cached getById the instant the user picks a value, instead of waiting for
 * the server round trip. Rolls back on error; reconciles with one background
 * refetch once the LAST in-flight edit settles - invalidating after each one
 * let an early refetch paint a stale value over a later edit (typing "13"
 * into Effort flashed back to "1"). Edits share a per-ticket mutation scope
 * so they still reach the server in the order they were made: the UI updates
 * at once, but an Effort of "1" can't commit after the "13" typed over it.
 *
 * The same patch lands on the ticket's row in every cached Backlog list, so
 * an edit in the peek drawer updates the row behind it in the same frame.
 *
 * Shared by the ticket detail page and the Backlog peek drawer.
 */
export function useTicketPropertyMutations(
  ticketId: string,
  lookups: TicketPropertyLookups,
) {
  const utils = api.useUtils();
  const summaries = useTicketSummaryCache();
  // Keyed by ticket: the detail page's nav arrows swap tickets without
  // remounting, and an edit still in flight on the previous ticket must not
  // suppress (or be suppressed by) the next ticket's reconcile.
  const inFlight = useRef(new Map<string, number>());
  const scope = { id: `ticket-properties:${ticketId}` };

  const snapshot = async () => {
    inFlight.current.set(ticketId, (inFlight.current.get(ticketId) ?? 0) + 1);
    const [, prevSummaries] = await Promise.all([
      utils.product.ticket.getById.cancel({ id: ticketId }),
      summaries.snapshot(ticketId),
    ]);
    return { prev: utils.product.ticket.getById.getData({ id: ticketId }), prevSummaries };
  };

  const rollback = (snap: Awaited<ReturnType<typeof snapshot>> | undefined) => {
    if (snap?.prev) utils.product.ticket.getById.setData({ id: ticketId }, snap.prev);
    summaries.restore(snap?.prevSummaries);
    notifications.show({
      title: "Update failed",
      message: "Your change was not saved. Please try again.",
      color: "red",
    });
  };

  const settle = async () => {
    const remaining = (inFlight.current.get(ticketId) ?? 1) - 1;
    if (remaining > 0) {
      inFlight.current.set(ticketId, remaining);
      return;
    }
    inFlight.current.delete(ticketId);
    await Promise.all([
      utils.product.ticket.getById.invalidate({ id: ticketId }),
      utils.product.ticket.listEvents.invalidate({ id: ticketId }),
      lookups.productId ? summaries.reconcile(lookups.productId, ticketId) : undefined,
    ]);
  };

  const updateTicket = api.product.ticket.update.useMutation({
    scope,
    onMutate: async (vars) => {
      const snap = await snapshot();
      const { prev } = snap;
      if (prev) {
        const next = { ...prev };
        if (vars.title !== undefined) next.title = vars.title;
        if (vars.status !== undefined) next.status = vars.status;
        if (vars.type !== undefined) next.type = vars.type;
        if (vars.priority !== undefined) next.priority = vars.priority ?? null;
        if (vars.points !== undefined) next.points = vars.points ?? null;
        if (vars.assigneeId !== undefined) {
          const m = lookups.members.find((x) => x.user.id === vars.assigneeId);
          next.assigneeId = vars.assigneeId ?? null;
          next.assignee =
            vars.assigneeId && m
              ? { id: m.user.id, name: m.user.name, email: m.user.email ?? null, image: m.user.image ?? null }
              : null;
        }
        if (vars.featureId !== undefined) {
          const f = lookups.features?.find((x) => x.id === vars.featureId);
          next.featureId = vars.featureId ?? null;
          next.feature = vars.featureId && f ? { id: f.id, name: f.name, status: f.status } : null;
        }
        if (vars.epicId !== undefined) {
          const e = lookups.epics?.find((x) => x.id === vars.epicId);
          next.epicId = vars.epicId ?? null;
          next.epic = vars.epicId && e ? { id: e.id, name: e.name, status: e.status } : null;
        }
        if (vars.cycleId !== undefined) {
          const c = lookups.cycles?.find((x) => x.id === vars.cycleId);
          next.cycleId = vars.cycleId ?? null;
          next.cycle =
            vars.cycleId && c
              ? { id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate }
              : null;
        }
        utils.product.ticket.getById.setData({ id: ticketId }, next);
      }
      summaries.patch(ticketId, (row) => {
        const r = { ...row };
        if (vars.title !== undefined) r.title = vars.title;
        if (vars.status !== undefined) r.status = vars.status;
        if (vars.type !== undefined) r.type = vars.type;
        if (vars.priority !== undefined) r.priority = vars.priority ?? null;
        if (vars.assigneeId !== undefined) {
          const m = lookups.members.find((x) => x.user.id === vars.assigneeId);
          r.assignee =
            vars.assigneeId && m
              ? { id: m.user.id, name: m.user.name, image: m.user.image ?? null }
              : null;
        }
        if (vars.featureId !== undefined) {
          const f = lookups.features?.find((x) => x.id === vars.featureId);
          r.feature = vars.featureId && f ? { id: f.id, name: f.name } : null;
        }
        if (vars.epicId !== undefined) {
          const e = lookups.epics?.find((x) => x.id === vars.epicId);
          r.epic = vars.epicId && e ? { id: e.id, name: e.name } : null;
        }
        if (vars.cycleId !== undefined) {
          const c = lookups.cycles?.find((x) => x.id === vars.cycleId);
          r.cycle =
            vars.cycleId && c
              ? { id: c.id, name: c.name, status: c.status, startDate: c.startDate, endDate: c.endDate }
              : null;
        }
        return withBlockedFlag(r);
      });
      return snap;
    },
    onError: (_err, _vars, mctx) => rollback(mctx),
    onSettled: settle,
  });

  // Labels are a replace-all set. Keep existing join rows, synthesise rows for
  // newly picked tags; an id we can't resolve yet (a tag created a moment ago)
  // is left for the reconcile refetch to fill in.
  const setTicketTags = api.tag.setTicketTags.useMutation({
    scope,
    onMutate: async (vars) => {
      const snap = await snapshot();
      const { prev } = snap;
      if (prev) {
        const tags: TicketTagRow[] = [];
        for (const tagId of vars.tagIds) {
          const existing = prev.tags.find((t) => t.tagId === tagId);
          if (existing) {
            tags.push(existing);
            continue;
          }
          const tag = lookups.tags?.find((t) => t.id === tagId);
          if (tag) {
            tags.push({ id: `optimistic-${tagId}`, ticketId, tagId, createdAt: new Date(), tag });
          }
        }
        utils.product.ticket.getById.setData({ id: ticketId }, { ...prev, tags });
      }
      summaries.patch(ticketId, (row) => {
        const tags: TicketSummary["tags"] = [];
        for (const tagId of vars.tagIds) {
          const tag =
            row.tags.find((t) => t.tag.id === tagId)?.tag ??
            lookups.tags?.find((t) => t.id === tagId);
          if (tag) {
            tags.push({ tag: { id: tag.id, name: tag.name, color: tag.color, category: tag.category } });
          }
        }
        return { ...row, tags };
      });
      return snap;
    },
    onError: (_err, _vars, mctx) => rollback(mctx),
    onSettled: settle,
  });

  const setField = (field: string, value: unknown) => {
    updateTicket.mutate({ id: ticketId, [field]: value });
  };

  return { updateTicket, setTicketTags, setField };
}
