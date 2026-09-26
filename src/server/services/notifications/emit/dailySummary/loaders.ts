/**
 * The Daily summary's per-user loaders that the daily-brief ceremony's
 * agenda sections share (ADR-0059 daily summary: one query, two renderings).
 * Kept apart from `build.ts` because that file imports the server error
 * reporter — and with it the Prisma singleton and env — at module load,
 * which the agenda section registry must not do.
 */
import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { partitionActions, type ActionPartition } from "~/lib/actions/partition";
import { ticketDisplayId } from "~/lib/fun-ids";
import { STATUS_ORDER } from "~/lib/ticket-statuses";
import { currentCycleOrder, currentCycleWhere } from "~/plugins/product/server/currentCycle";
import {
  computeCyclePacing,
  computeCycleRollup,
} from "~/plugins/product/server/cycleRollup";
import type { DailySummaryCycle } from "./types";

/** In-flight = started but not finished: the cycle block's "your tickets" list. */
const IN_FLIGHT_STATUSES = new Set(["IN_PROGRESS", "BLOCKED", "QA"]);
/**
 * Up next = committed to the cycle but not started (the complement of
 * in-flight, so the two lists never overlap). Cycle tickets still in the
 * refinement statuses appear in neither list — only as a one-line count.
 */
const UP_NEXT_STATUS = "COMMITTED";
const UNREFINED_STATUSES = new Set(["BACKLOG", "NEEDS_REFINEMENT", "READY_TO_PLAN"]);

/**
 * Today's actions for the digest: exactly the `todays` bucket of the shared
 * `partitionActions` (ADR-0034) over the same ownership set as
 * `action.getTodaysActions` — created-by-me-with-no-assignees OR assigned-to-me,
 * `ACTIVE`, across every workspace — plus the `overdue` bucket (names and
 * count).
 *
 * `partitionActions` buckets by server-local calendar day. Shifting every
 * instant into the user's timezone frame first (`toZonedTime`, the same shift
 * `summaries.ts` applies to decide the fire window) makes "today" the user's
 * local day without re-implementing the buckets here.
 */
/** An owned action after the timezone shift, as the partition buckets carry it. */
export interface OwnedAction {
  id: string;
  name: string;
  status: string;
  priority: string | null;
  scheduledStart: Date | null;
  dueDate: Date | null;
  projectId: string | null;
  completedAt: Date | null;
}

export async function partitionOwnedActions(
  db: PrismaClient,
  userId: string,
  localNow: Date,
  tz: string,
): Promise<ActionPartition<OwnedAction>> {
  const actions = await db.action.findMany({
    where: {
      OR: [
        { createdById: userId, assignees: { none: {} } },
        { assignees: { some: { userId } } },
      ],
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      scheduledStart: true,
      dueDate: true,
      projectId: true,
      completedAt: true,
    },
  });

  const shift = (d: Date | null) => (d ? toZonedTime(d, tz) : null);
  return partitionActions<OwnedAction>(
    actions.map((a) => ({
      ...a,
      scheduledStart: shift(a.scheduledStart),
      dueDate: shift(a.dueDate),
      completedAt: shift(a.completedAt),
    })),
    { today: localNow },
  );
}

export interface CycleScope {
  workspaceId: string;
  workspaceSlug: string;
}

/**
 * One condensed cycle block per product in the summary workspace where the
 * user holds tickets, in product-name order. The current cycle per product is
 * chosen exactly as `product.getOverview` does (this product's own cycle or one
 * holding its tickets, else a legacy workspace-shared cycle — never another
 * product's) and its numbers come from the same `computeCycleRollup` /
 * `computeCyclePacing` the product page renders, so the two cannot disagree.
 * A product with no current cycle contributes no block.
 */
export async function loadCycleBlocks(
  db: PrismaClient,
  userId: string,
  scope: CycleScope,
  now: Date,
  tz: string,
  baseUrl: string,
): Promise<DailySummaryCycle[]> {
  const products = await db.product.findMany({
    where: {
      workspaceId: scope.workspaceId,
      tickets: { some: { assigneeId: userId } },
    },
    select: { id: true, name: true, slug: true, funTicketIds: true },
    orderBy: { name: "asc" },
  });
  if (products.length === 0) return [];

  const cycleWhere = currentCycleWhere(scope.workspaceId, now);
  const cycleSelect = {
    id: true,
    name: true,
    status: true,
    startDate: true,
    endDate: true,
  };
  const productBase = (slug: string) =>
    `${baseUrl}/w/${scope.workspaceSlug}/products/${slug}`;
  const statusRank = (s: string) => STATUS_ORDER[s] ?? 99;

  // The products are independent, so their cycle + ticket reads run together;
  // product-name order is preserved by Promise.all.
  const loadBlock = async (
    product: (typeof products)[number],
  ): Promise<DailySummaryCycle | null> => {
    const own = await db.list.findFirst({
      where: {
        AND: [
          cycleWhere,
          {
            OR: [
              { productId: product.id },
              { tickets: { some: { productId: product.id } } },
            ],
          },
        ],
      },
      orderBy: currentCycleOrder,
      select: cycleSelect,
    });
    const cycle =
      own ??
      (await db.list.findFirst({
        where: { ...cycleWhere, productId: null },
        orderBy: currentCycleOrder,
        select: cycleSelect,
      }));
    if (!cycle) return null;

    // One ticket query per product: the whole cycle for the rollup, the
    // user's rows filtered from it for the in-flight list.
    const cycleTickets = await db.ticket.findMany({
      where: { productId: product.id, cycleId: cycle.id },
      select: {
        id: true,
        shortId: true,
        number: true,
        title: true,
        status: true,
        points: true,
        assigneeId: true,
        updatedAt: true,
      },
    });

    const rollup = computeCycleRollup(cycle, cycleTickets, { userId });
    const pacing = computeCyclePacing(rollup, now);
    const mine = cycleTickets.filter((t) => t.assigneeId === userId);
    const label = (t: (typeof cycleTickets)[number]) =>
      `${ticketDisplayId(product, t)} ${t.title}`;
    const ticketUrl = (t: { id: string }) =>
      `${productBase(product.slug)}/tickets/${t.id}`;

    return {
      productName: product.name,
      name: cycle.name,
      range:
        cycle.startDate && cycle.endDate
          ? `${formatInTimeZone(cycle.startDate, tz, "d MMM")} – ${formatInTimeZone(cycle.endDate, tz, "d MMM")}`
          : null,
      daysLeft: pacing.daysLeft,
      completed: rollup.completed,
      committed: rollup.committed,
      unit: rollup.usesPoints ? "pts" : "tickets",
      elapsedPct: pacing.timePct !== null ? Math.round(pacing.timePct) : null,
      pace: pacing.pace,
      cycleUrl: `${productBase(product.slug)}/cycles/${cycle.id}`,
      inFlight: mine
        .filter((t) => IN_FLIGHT_STATUSES.has(t.status))
        .sort((a, b) => statusRank(a.status) - statusRank(b.status))
        .map((t) => ({
          label: label(t),
          title: t.title,
          status: t.status,
          url: ticketUrl(t),
        })),
      upNext: mine
        .filter((t) => t.status === UP_NEXT_STATUS)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((t) => ({ label: label(t), title: t.title, url: ticketUrl(t) })),
      unrefinedCount: mine.filter((t) => UNREFINED_STATUSES.has(t.status)).length,
    };
  };

  const blocks = await Promise.all(products.map(loadBlock));
  return blocks.filter((b): b is DailySummaryCycle => b !== null);
}
