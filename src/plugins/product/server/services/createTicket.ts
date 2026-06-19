import type {
  Prisma,
  PrismaClient,
  Ticket,
  TicketStatus,
  TicketType,
} from "@prisma/client";
import { generateFunId } from "~/lib/fun-ids";
import { recordActivity } from "~/server/services/activity/recordActivity";

/**
 * Fields a caller supplies to create a Ticket. Mirrors the writable columns of
 * the `Ticket` model; `number` and `shortId` are derived by the service, never
 * passed in.
 */
export interface CreateTicketInput {
  /** Product the ticket belongs to. Its `ticketCounter` is incremented. */
  productId: string;
  /**
   * Workspace the product lives in — used only for the activity-feed write.
   * The caller already has this (it loaded the product), so we don't re-query.
   */
  workspaceId: string;
  /**
   * Author of the ticket. The service performs **no** access control — the
   * caller is responsible for authorizing this user (or, for trusted callers
   * like the Sentry webhook, for choosing a system author). `recordActivity`
   * attributes the `created` event to this same id.
   */
  createdById: string;
  title: string;
  body?: string | null;
  type?: TicketType;
  status?: TicketStatus;
  priority?: number | null;
  points?: number | null;
  branchName?: string | null;
  prUrl?: string | null;
  designUrl?: string | null;
  specUrl?: string | null;
  links?: Prisma.InputJsonValue | null;
  epicId?: string | null;
  featureId?: string | null;
  cycleId?: string | null;
  scopeId?: string | null;
  assigneeId?: string | null;
}

/**
 * Shared Ticket create-mechanics: atomically increment the product's ticket
 * counter for the `number`, mint a fun `shortId` when the product has fun IDs
 * enabled, create the `Ticket`, and record the workspace activity event.
 *
 * This is the single source of truth for "how a Ticket is born", reused by the
 * product-UI `ticket.create` mutation, the agent's `mastra.createTicket`, and
 * the Sentry bug webhook (ADR-0016: collapse the duplicate copies; ADR-0027:
 * the webhook builds on this). Access control stays at the call boundary — this
 * function trusts `createdById`.
 */
export async function createTicketWithNumber(
  db: PrismaClient,
  input: CreateTicketInput,
): Promise<Ticket> {
  // Atomically increment the product's ticket counter to get the number.
  const updated = await db.product.update({
    where: { id: input.productId },
    data: { ticketCounter: { increment: 1 } },
    select: { ticketCounter: true, funTicketIds: true },
  });

  // Generate a fun short ID only when the product has them enabled.
  let shortId: string | null = null;
  if (updated.funTicketIds) {
    const existing = await db.ticket.findMany({
      where: { productId: input.productId },
      select: { shortId: true },
    });
    const existingIds = new Set(
      existing.map((t) => t.shortId).filter(Boolean) as string[],
    );
    shortId = generateFunId(existingIds);
  }

  const ticket = await db.ticket.create({
    data: {
      productId: input.productId,
      number: updated.ticketCounter,
      shortId,
      title: input.title,
      body: input.body ?? undefined,
      type: input.type ?? "FEATURE",
      status: input.status ?? "BACKLOG",
      priority: input.priority ?? undefined,
      points: input.points ?? undefined,
      branchName: input.branchName ?? undefined,
      prUrl: input.prUrl ?? undefined,
      designUrl: input.designUrl ?? undefined,
      specUrl: input.specUrl ?? undefined,
      links: input.links ?? undefined,
      epicId: input.epicId ?? undefined,
      featureId: input.featureId ?? undefined,
      cycleId: input.cycleId ?? undefined,
      scopeId: input.scopeId ?? undefined,
      assigneeId: input.assigneeId ?? undefined,
      createdById: input.createdById,
    },
  });

  // Workspace activity feed instrumentation — non-fatal if it fails.
  await recordActivity(db, {
    workspaceId: input.workspaceId,
    userId: input.createdById,
    entityType: "ticket",
    entityId: ticket.id,
    action: "created",
    metadata: { title: input.title },
  }).catch(() => {
    /* instrumentation failure is non-fatal */
  });

  return ticket;
}
