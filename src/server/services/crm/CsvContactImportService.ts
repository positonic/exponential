import { Prisma, type PrismaClient } from "@prisma/client";

import { db } from "~/server/db";
import { encryptString } from "~/server/utils/encryption";
import {
  buildContactRow,
  type ContactCsvRow,
  type CsvColumnMapping,
} from "~/lib/contactCsvImport";
import { emailHashFor } from "./createCrmContact";

/** Hard cap on data rows per import. */
export const CSV_IMPORT_MAX_ROWS = 5000;

/**
 * Hard cap on rows per chunk call. The client sends smaller chunks; this is
 * the server-side bound that keeps one call comfortably inside a request
 * cycle (each row is ~2 queries).
 */
export const CSV_IMPORT_MAX_CHUNK = 500;

/** How many errors we keep verbatim on the batch for the user to inspect. */
const MAX_RECORDED_ERRORS = 20;

export interface CsvImportDealConfig {
  /** Pipeline = a Project of type "pipeline"; the stage must belong to it. */
  pipelineId: string;
  stageId: string;
}

interface CsvImportContext {
  workspaceId: string;
  userId: string;
}

export interface CsvChunkParams extends CsvImportContext {
  batchId: string;
  headers: string[];
  rows: string[][];
  /** Index of this chunk's first row within the whole file's data rows. */
  rowOffset: number;
  mapping: CsvColumnMapping;
  /** When set, rows with a mapped revenue value also create a Deal. */
  dealConfig?: CsvImportDealConfig | null;
}

export interface CsvChunkResult {
  batchId: string;
  status: string;
  processedContacts: number;
  newContacts: number;
  updatedContacts: number;
  errorCount: number;
  /** Recorded error lines (capped at MAX_RECORDED_ERRORS across the batch). */
  errors: string[];
  completed: boolean;
}

/**
 * CSV → CrmContact import, driven by the client in chunks.
 *
 * The original shape (one mutation, fire-and-forget processing, status
 * polling — mirroring ContactSyncService) does not survive serverless: Vercel
 * freezes the function once the mutation response is sent, so the background
 * loop stalled partway through real imports. Instead the dialog now calls
 * `crmContact.importFromCsv` once per chunk; every chunk is processed
 * synchronously inside its own request and the response carries the batch
 * counters, so no background execution or polling is involved.
 *
 * Writes contacts directly with `db.crmContact.create` — deliberately NOT via
 * `createCrmContact`/`crmContact.create` — so `dispatchContactTypeAutomations`
 * never runs. Bulk imports must not fire per-contact onboarding automations
 * (welcome emails, agreements); see the bulk-import note in CONTEXT.md.
 */
export async function createCsvImportBatch(
  ctx: CsvImportContext,
  totalRows: number,
): Promise<string> {
  const batch = await db.contactImportBatch.create({
    data: {
      workspaceId: ctx.workspaceId,
      createdById: ctx.userId,
      source: "CSV",
      status: "IN_PROGRESS",
      totalContacts: totalRows,
    },
  });
  return batch.id;
}

/**
 * Process one chunk of rows synchronously and roll its counts into the batch.
 * Chunks arrive sequentially from one client, so plain read-modify-write on
 * the batch row is safe. Throws (for the router to translate) when the batch
 * doesn't exist, belongs elsewhere, or is already finished.
 */
export async function processCsvChunk(
  params: CsvChunkParams,
): Promise<CsvChunkResult> {
  const batch = await db.contactImportBatch.findUnique({
    where: { id: params.batchId },
  });
  if (
    !batch ||
    batch.workspaceId !== params.workspaceId ||
    batch.source !== "CSV"
  ) {
    throw new Error("Import batch not found");
  }
  if (batch.status !== "IN_PROGRESS") {
    throw new Error("This import has already finished");
  }
  if (batch.processedContacts + params.rows.length > batch.totalContacts) {
    throw new Error("Chunk exceeds the announced row count of this import");
  }

  const priorErrors = recordedErrorsOf(batch.metadata);

  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const newErrors: string[] = [];

  const recordError = (rowIndex: number, message: string) => {
    errorCount++;
    if (priorErrors.length + newErrors.length < MAX_RECORDED_ERRORS) {
      // +2: 1-based and the header line, so the number matches the file.
      newErrors.push(`Row ${params.rowOffset + rowIndex + 2}: ${message}`);
    }
  };

  for (let i = 0; i < params.rows.length; i++) {
    const row = buildContactRow(params.headers, params.rows[i]!, params.mapping);
    try {
      if (!row.email) {
        recordError(i, "missing or invalid email");
      } else {
        const outcome = await upsertContact(db, params, row);
        if (outcome.result === "created") created++;
        else if (outcome.result === "updated") updated++;
        if (params.dealConfig && row.deal && row.deal.value > 0) {
          await createDealIfMissing(
            db,
            params,
            params.dealConfig,
            outcome.contactId,
            row,
          );
        }
      }
    } catch (error) {
      console.error(
        `CSV import: row ${params.rowOffset + i + 2} failed`,
        error,
      );
      recordError(
        i,
        error instanceof Error ? error.message : "unexpected error",
      );
    }
  }

  const allErrors = [...priorErrors, ...newErrors];
  const processedContacts = batch.processedContacts + params.rows.length;
  const totalErrorCount = batch.errorCount + errorCount;
  const completed = processedContacts >= batch.totalContacts;
  const status = completed
    ? totalErrorCount > 0
      ? "PARTIAL_SUCCESS"
      : "COMPLETED"
    : "IN_PROGRESS";

  const updatedBatch = await db.contactImportBatch.update({
    where: { id: batch.id },
    data: {
      status,
      processedContacts,
      newContacts: batch.newContacts + created,
      updatedContacts: batch.updatedContacts + updated,
      errorCount: totalErrorCount,
      metadata: allErrors.length > 0 ? { errors: allErrors } : Prisma.JsonNull,
      ...(completed ? { completedAt: new Date() } : {}),
    },
  });

  return {
    batchId: updatedBatch.id,
    status: updatedBatch.status,
    processedContacts: updatedBatch.processedContacts,
    newContacts: updatedBatch.newContacts,
    updatedContacts: updatedBatch.updatedContacts,
    errorCount: updatedBatch.errorCount,
    errors: allErrors,
    completed,
  };
}

function recordedErrorsOf(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const errors = (metadata as { errors?: unknown }).errors;
  return Array.isArray(errors)
    ? errors.filter((e): e is string => typeof e === "string")
    : [];
}

async function upsertContact(
  prisma: PrismaClient,
  ctx: CsvImportContext,
  row: ContactCsvRow,
): Promise<{ contactId: string; result: "created" | "updated" | "unchanged" }> {
  const email = row.email!;
  const emailHash = emailHashFor(email);
  const now = new Date();

  const existing = await prisma.crmContact.findUnique({
    where: {
      workspaceId_emailHash: { workspaceId: ctx.workspaceId, emailHash },
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
        workspaceId: ctx.workspaceId,
        createdById: ctx.userId,
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
          workspaceId_emailHash: { workspaceId: ctx.workspaceId, emailHash },
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
  ctx: CsvImportContext,
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
      workspaceId: ctx.workspaceId,
      createdById: ctx.userId,
      stageOrder: (lastDeal?.stageOrder ?? -1) + 1,
    },
    include: { stage: { select: { name: true } } },
  });

  await prisma.dealActivity.create({
    data: {
      dealId: deal.id,
      userId: ctx.userId,
      type: "CREATED",
      content: `Deal "${deal.title}" created in ${deal.stage.name} by CSV import`,
      metadata: { stageId: dealConfig.stageId, stageName: deal.stage.name },
    },
  });
}
