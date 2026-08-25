import { Prisma, type PrismaClient } from "@prisma/client";

import { db } from "~/server/db";
import { encryptString } from "~/server/utils/encryption";
import {
  buildContactRow,
  type ContactCsvRow,
  type CsvColumnMapping,
} from "~/lib/contactCsvImport";
import { emailHashFor } from "./createCrmContact";

/** Hard cap on data rows per import — keeps one batch inside a request cycle. */
export const CSV_IMPORT_MAX_ROWS = 5000;

/** How many errors we keep verbatim on the batch for the user to inspect. */
const MAX_RECORDED_ERRORS = 20;

/** Batch counters are flushed to the DB every N rows (and once at the end). */
const PROGRESS_FLUSH_EVERY = 25;

export interface CsvImportDealConfig {
  /** Pipeline = a Project of type "pipeline"; the stage must belong to it. */
  pipelineId: string;
  stageId: string;
}

export interface CsvImportParams {
  workspaceId: string;
  userId: string;
  headers: string[];
  rows: string[][];
  mapping: CsvColumnMapping;
  /** When set, rows with a mapped revenue value also create a Deal. */
  dealConfig?: CsvImportDealConfig | null;
}

/**
 * CSV → CrmContact import. Mirrors ContactSyncService's batch contract
 * (ContactImportBatch + un-awaited processing + status polling) so the UI's
 * existing `getImportStatus` polling tail works unchanged.
 *
 * Writes contacts directly with `db.crmContact.create` — deliberately NOT via
 * `createCrmContact`/`crmContact.create` — so `dispatchContactTypeAutomations`
 * never runs. Bulk imports must not fire per-contact onboarding automations
 * (welcome emails, agreements); see the bulk-import note in CONTEXT.md.
 */
export async function startCsvContactImport(
  params: CsvImportParams,
): Promise<string> {
  const batch = await db.contactImportBatch.create({
    data: {
      workspaceId: params.workspaceId,
      createdById: params.userId,
      source: "CSV",
      status: "PENDING",
      totalContacts: params.rows.length,
    },
  });

  // Same fire-and-forget shape as ContactSyncService.importContacts — the
  // client polls getImportStatus. (A job queue would be the production-grade
  // home for this, as noted there.)
  processCsvBatch(db, batch.id, params).catch((error) => {
    console.error("CSV import batch failed:", error);
    db.contactImportBatch
      .update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          metadata: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
          completedAt: new Date(),
        },
      })
      .catch(console.error);
  });

  return batch.id;
}

async function processCsvBatch(
  prisma: PrismaClient,
  batchId: string,
  params: CsvImportParams,
): Promise<void> {
  await prisma.contactImportBatch.update({
    where: { id: batchId },
    data: { status: "IN_PROGRESS" },
  });

  let processed = 0;
  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: string[] = [];

  const recordError = (rowIndex: number, message: string) => {
    errorCount++;
    if (errors.length < MAX_RECORDED_ERRORS) {
      // +2: 1-based and the header line, so the number matches the file.
      errors.push(`Row ${rowIndex + 2}: ${message}`);
    }
  };

  const flushProgress = async () => {
    await prisma.contactImportBatch.update({
      where: { id: batchId },
      data: {
        processedContacts: processed,
        newContacts: created,
        updatedContacts: updated,
        errorCount,
      },
    });
  };

  for (let i = 0; i < params.rows.length; i++) {
    const row = buildContactRow(params.headers, params.rows[i]!, params.mapping);
    try {
      if (!row.email) {
        recordError(i, "missing or invalid email");
      } else {
        const outcome = await upsertContact(prisma, params, row);
        if (outcome.result === "created") created++;
        else if (outcome.result === "updated") updated++;
        if (params.dealConfig && row.deal && row.deal.value > 0) {
          await createDealIfMissing(
            prisma,
            params,
            params.dealConfig,
            outcome.contactId,
            row,
          );
        }
      }
    } catch (error) {
      console.error(`CSV import: row ${i + 2} failed`, error);
      recordError(
        i,
        error instanceof Error ? error.message : "unexpected error",
      );
    }
    processed++;
    if (processed % PROGRESS_FLUSH_EVERY === 0) await flushProgress();
  }

  await prisma.contactImportBatch.update({
    where: { id: batchId },
    data: {
      status: errorCount > 0 ? "PARTIAL_SUCCESS" : "COMPLETED",
      processedContacts: processed,
      newContacts: created,
      updatedContacts: updated,
      errorCount,
      metadata: errors.length > 0 ? { errors } : Prisma.JsonNull,
      completedAt: new Date(),
    },
  });
}

async function upsertContact(
  prisma: PrismaClient,
  params: CsvImportParams,
  row: ContactCsvRow,
): Promise<{ contactId: string; result: "created" | "updated" | "unchanged" }> {
  const email = row.email!;
  const emailHash = emailHashFor(email);
  const now = new Date();

  const existing = await prisma.crmContact.findUnique({
    where: {
      workspaceId_emailHash: { workspaceId: params.workspaceId, emailHash },
    },
  });

  if (existing) {
    // Fill-empty-only merge, same posture as the Google sync: an import never
    // overwrites data a human (or a better source) already put there.
    const data: Prisma.CrmContactUpdateInput = { lastSyncedAt: now };
    if (!existing.firstName && row.firstName) data.firstName = row.firstName;
    if (!existing.lastName && row.lastName) data.lastName = row.lastName;
    if (!existing.phone && row.phone) data.phone = encryptString(row.phone);
    if (!existing.linkedIn && row.linkedIn)
      data.linkedIn = encryptString(row.linkedIn);
    if (!existing.twitter && row.twitter)
      data.twitter = encryptString(row.twitter);
    if (!existing.github && row.github) data.github = encryptString(row.github);
    if (!existing.telegram && row.telegram)
      data.telegram = encryptString(row.telegram);
    if (!existing.bluesky && row.bluesky)
      data.bluesky = encryptString(row.bluesky);
    if (!existing.about && row.about) data.about = row.about;
    if (!existing.profileType && row.profileType)
      data.profileType = row.profileType;
    if (!existing.firstSeenAt && row.firstSeenAt)
      data.firstSeenAt = row.firstSeenAt;

    const mergedTags = [...new Set([...existing.tags, ...row.tags])];
    if (mergedTags.length > existing.tags.length) data.tags = mergedTags;

    if (Object.keys(row.metadata).length > 0) {
      const existingMeta =
        existing.metadata &&
        typeof existing.metadata === "object" &&
        !Array.isArray(existing.metadata)
          ? existing.metadata
          : {};
      // New keys from this import; existing values win on collision.
      const mergedMeta = { ...row.metadata, ...existingMeta };
      if (
        Object.keys(mergedMeta).some((k) => !(k in existingMeta)) ||
        Object.keys(existingMeta).length === 0
      ) {
        data.metadata = mergedMeta;
      }
    }

    const changedKeys = Object.keys(data).filter((k) => k !== "lastSyncedAt");
    if (changedKeys.length > 0) {
      await prisma.crmContact.update({ where: { id: existing.id }, data });
      return { contactId: existing.id, result: "updated" };
    }
    return { contactId: existing.id, result: "unchanged" };
  }

  try {
    const contact = await prisma.crmContact.create({
      data: {
        workspaceId: params.workspaceId,
        createdById: params.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: encryptString(email),
        emailHash,
        phone: row.phone ? encryptString(row.phone) : undefined,
        linkedIn: row.linkedIn ? encryptString(row.linkedIn) : undefined,
        twitter: row.twitter ? encryptString(row.twitter) : undefined,
        github: row.github ? encryptString(row.github) : undefined,
        telegram: row.telegram ? encryptString(row.telegram) : undefined,
        bluesky: row.bluesky ? encryptString(row.bluesky) : undefined,
        about: row.about,
        profileType: row.profileType,
        tags: row.tags,
        firstSeenAt: row.firstSeenAt,
        metadata:
          Object.keys(row.metadata).length > 0 ? row.metadata : undefined,
        importSource: "CSV",
        lastSyncedAt: now,
      },
      select: { id: true },
    });
    return { contactId: contact.id, result: "created" };
  } catch (err) {
    // Concurrent write raced us to (workspaceId, emailHash) — treat the
    // winner as ours, same as createCrmContact.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const winner = await prisma.crmContact.findUniqueOrThrow({
        where: {
          workspaceId_emailHash: { workspaceId: params.workspaceId, emailHash },
        },
        select: { id: true },
      });
      return { contactId: winner.id, result: "unchanged" };
    }
    throw err;
  }
}

/**
 * One Deal per (pipeline, contact): re-importing the same file, or a later
 * export of the same audience, must not stack duplicate revenue cards.
 */
async function createDealIfMissing(
  prisma: PrismaClient,
  params: CsvImportParams,
  dealConfig: CsvImportDealConfig,
  contactId: string,
  row: ContactCsvRow,
): Promise<void> {
  const existingDeal = await prisma.deal.findFirst({
    where: { projectId: dealConfig.pipelineId, contactId },
    select: { id: true },
  });
  if (existingDeal) return;

  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  const lastDeal = await prisma.deal.findFirst({
    where: { projectId: dealConfig.pipelineId, stageId: dealConfig.stageId },
    orderBy: { stageOrder: "desc" },
    select: { stageOrder: true },
  });

  const deal = await prisma.deal.create({
    data: {
      projectId: dealConfig.pipelineId,
      stageId: dealConfig.stageId,
      title: name !== "" ? name : row.email!,
      value: row.deal!.value,
      currency: row.deal!.currency,
      contactId,
      workspaceId: params.workspaceId,
      createdById: params.userId,
      stageOrder: (lastDeal?.stageOrder ?? -1) + 1,
    },
    include: { stage: { select: { name: true } } },
  });

  await prisma.dealActivity.create({
    data: {
      dealId: deal.id,
      userId: params.userId,
      type: "CREATED",
      content: `Deal "${deal.title}" created in ${deal.stage.name} by CSV import`,
      metadata: { stageId: dealConfig.stageId, stageName: deal.stage.name },
    },
  });
}
