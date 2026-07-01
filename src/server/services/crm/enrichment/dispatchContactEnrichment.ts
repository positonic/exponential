import { type PrismaClient } from "@prisma/client";

/**
 * Event-driven, opt-in CRM contact enrichment dispatcher. Wired into the two
 * contact create paths (`crmContact.create` and `crmApi.contactCreate`).
 *
 * When a workspace has `enableAutoEnrichContacts` on, this writes a durable
 * `CrmContactEnrichment` row (status PENDING) — a fast, awaited DB write and
 * nothing more. The heavy work (web search + write-back) runs later, out of
 * band: the `enrich-pending-contacts` cron drains PENDING rows and hands each
 * contact to Mastra's `enrichmentAgent`. The row is the "event" and the audit
 * trail, mirroring how `ContactImportBatch` backs the Gmail/Calendar import.
 *
 * A durable queue row (rather than a fire-and-forget fetch from the mutation)
 * is deliberate: Vercel serverless can freeze a function after it returns its
 * response, orphaning un-awaited async work.
 *
 * Idempotent: a contact that already has a non-FAILED enrichment is skipped, so
 * dedupe-hit re-creates never pile up duplicate jobs. Failures are swallowed —
 * enrichment must never break contact creation.
 */
export interface DispatchEnrichmentInput {
  contactId: string;
  workspaceId: string;
  createdById?: string;
}

export async function dispatchContactEnrichment(
  db: PrismaClient,
  input: DispatchEnrichmentInput,
): Promise<{ enqueued: boolean }> {
  try {
    const workspace = await db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { enableAutoEnrichContacts: true },
    });
    if (!workspace?.enableAutoEnrichContacts) return { enqueued: false };

    // Idempotency: don't stack jobs for a contact already queued/enriched.
    // Only a FAILED prior attempt should be re-queued (by an explicit retry).
    const existing = await db.crmContactEnrichment.findFirst({
      where: {
        contactId: input.contactId,
        status: { in: ["PENDING", "RUNNING", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (existing) return { enqueued: false };

    await db.crmContactEnrichment.create({
      data: {
        contactId: input.contactId,
        workspaceId: input.workspaceId,
        status: "PENDING",
        createdById: input.createdById,
      },
    });
    return { enqueued: true };
  } catch (err) {
    console.error(
      "[crmEnrichment] failed to enqueue enrichment for contact",
      input.contactId,
      err,
    );
    return { enqueued: false };
  }
}
