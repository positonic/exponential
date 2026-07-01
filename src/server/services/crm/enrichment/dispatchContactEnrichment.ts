import { type PrismaClient } from "@prisma/client";

export interface EnqueueEnrichmentInput {
  contactId: string;
  workspaceId: string;
  createdById?: string;
}

export interface EnqueueEnrichmentResult {
  enqueued: boolean;
  /** The relevant enrichment row id — the newly created one, or the in-flight one that blocked it. */
  enrichmentId?: string;
  /** Why nothing was enqueued (only set when `enqueued` is false). */
  reason?: "auto-enrich-disabled" | "already-in-flight";
}

/**
 * Core enqueue: writes a PENDING `CrmContactEnrichment` row for a contact, to be
 * drained later by the `enrich-pending-contacts` cron (which hands it to
 * Mastra's `enrichmentAgent`). The row is a durable queue entry and audit
 * record, mirroring how `ContactImportBatch` backs the Gmail/Calendar import. A
 * durable row (rather than a fire-and-forget fetch) is deliberate: Vercel
 * serverless can freeze a function after it returns, orphaning un-awaited work.
 *
 * Shared by two callers:
 * - the auto path (`dispatchContactEnrichment`, fired on contact create) —
 *   `force: false`, gated on the workspace's `enableAutoEnrichContacts` flag;
 * - the explicit "enrich now" path (`crmApi.contactEnrich`) — `force: true`,
 *   which bypasses the flag because the user asked for it directly.
 *
 * Idempotency: never stacks a second job while one is PENDING or RUNNING. The
 * auto path additionally treats an already-COMPLETED contact as done (enrich
 * once); the forced path allows re-enriching a contact whose last job COMPLETED
 * or FAILED.
 *
 * Unlike `dispatchContactEnrichment`, this does NOT swallow errors — an explicit
 * caller wants to know if the enqueue failed.
 */
export async function enqueueContactEnrichment(
  db: PrismaClient,
  input: EnqueueEnrichmentInput,
  opts: { force?: boolean } = {},
): Promise<EnqueueEnrichmentResult> {
  const force = opts.force ?? false;

  if (!force) {
    const workspace = await db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { enableAutoEnrichContacts: true },
    });
    if (!workspace?.enableAutoEnrichContacts) {
      return { enqueued: false, reason: "auto-enrich-disabled" };
    }
  }

  // Never run two jobs for one contact at once. The auto path also treats a
  // COMPLETED contact as done; the forced path lets the user re-enrich it.
  const blockingStatuses = force
    ? ["PENDING", "RUNNING"]
    : ["PENDING", "RUNNING", "COMPLETED"];
  const existing = await db.crmContactEnrichment.findFirst({
    where: { contactId: input.contactId, status: { in: blockingStatuses } },
    select: { id: true },
  });
  if (existing) {
    return { enqueued: false, enrichmentId: existing.id, reason: "already-in-flight" };
  }

  const row = await db.crmContactEnrichment.create({
    data: {
      contactId: input.contactId,
      workspaceId: input.workspaceId,
      status: "PENDING",
      createdById: input.createdById,
    },
    select: { id: true },
  });
  return { enqueued: true, enrichmentId: row.id };
}

export type DispatchEnrichmentInput = EnqueueEnrichmentInput;

/**
 * Auto path: fired on contact create from both create mutations. Flag-gated and
 * error-swallowing — enrichment must never break contact creation. Thin wrapper
 * over `enqueueContactEnrichment` with `force: false`.
 */
export async function dispatchContactEnrichment(
  db: PrismaClient,
  input: DispatchEnrichmentInput,
): Promise<{ enqueued: boolean }> {
  try {
    const result = await enqueueContactEnrichment(db, input, { force: false });
    return { enqueued: result.enqueued };
  } catch (err) {
    console.error(
      "[crmEnrichment] failed to enqueue enrichment for contact",
      input.contactId,
      err,
    );
    return { enqueued: false };
  }
}
