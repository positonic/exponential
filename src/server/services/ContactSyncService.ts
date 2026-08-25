import type { Prisma } from "@prisma/client";

import { db } from "~/server/db";
import {
  GoogleContactsService,
  type ContactInfo,
  type GoogleCalendarEvent,
} from "./GoogleContactsService";
import { ConnectionStrengthCalculator } from "./ConnectionStrengthCalculator";
import { encryptString } from "~/server/utils/encryption";
import crypto from "crypto";

export interface ImportOptions {
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export type ImportSource = "GMAIL" | "CALENDAR" | "BOTH";

/**
 * Contacts fetched (and upserted) per GMAIL step — one People API page.
 * Each contact is ~2 queries, so a step stays a few seconds.
 */
const GMAIL_PAGE_SIZE = 200;

/** Calendar events fetched per CALENDAR page. */
const CALENDAR_EVENTS_PER_PAGE = 100;

/**
 * Cap on contact×event pairs handled per CALENDAR step. Interactions are
 * created per pair (~3 queries each), and a single recurring all-hands can
 * put thousands of pairs in one events page — the budget splits such pages
 * across steps via `contactOffset` instead of blowing the request.
 */
const CALENDAR_STEP_PAIR_BUDGET = 300;

/** How many errors we keep verbatim on the batch for the user to inspect. */
const MAX_RECORDED_ERRORS = 20;

/**
 * Where the next step picks up. Persisted in the batch's metadata between
 * requests; absent once the import has finished.
 */
interface ImportCursor {
  phase: "GMAIL" | "CALENDAR";
  /** Google page token for the phase's current page (first page when unset). */
  pageToken?: string;
  /**
   * CALENDAR only: index of the next contact within the current page's
   * extracted-contact list, for pages too heavy for one step.
   */
  contactOffset?: number;
}

export interface ImportStepResult {
  batchId: string;
  status: string;
  /** Phase the NEXT step will run, or null when the import is finished. */
  phase: "GMAIL" | "CALENDAR" | null;
  totalContacts: number;
  processedContacts: number;
  newContacts: number;
  updatedContacts: number;
  errorCount: number;
  /** Recorded error lines (capped at MAX_RECORDED_ERRORS across the batch). */
  errors: string[];
  completed: boolean;
}

interface StepCounters {
  processed: number;
  created: number;
  updated: number;
  errorCount: number;
  newErrors: string[];
  nextCursor: ImportCursor | null;
}

/**
 * Google Contacts/Calendar → CrmContact import, driven by the client in
 * steps. The original shape (one mutation, fire-and-forget processing,
 * status polling) does not survive serverless: Vercel freezes the function
 * once the mutation response is sent, so large imports stalled mid-batch.
 *
 * Unlike the CSV import (where the client holds the rows and streams them
 * up in chunks), the data here lives at Google — so each step fetches one
 * bounded slice server-side and the resume point is a Google page token,
 * kept in the batch's metadata. The client calls `crmContact.importContacts`
 * repeatedly with the batchId until `completed`; every step runs
 * synchronously inside its own request, and a retried step is safe because
 * contacts dedupe on email hash and interactions on Google event id.
 */
export class ContactSyncService {
  /**
   * Create the batch a stepped import will roll its counts into. The date
   * range is resolved and stored here so every CALENDAR step queries the
   * same window.
   */
  static async createImportBatch(
    workspaceId: string,
    userId: string,
    source: ImportSource,
    options: ImportOptions = {}
  ): Promise<string> {
    const cursor: ImportCursor =
      source === "CALENDAR" ? { phase: "CALENDAR" } : { phase: "GMAIL" };

    const metadata: Prisma.JsonObject = { cursor: { ...cursor } };

    if (source === "CALENDAR" || source === "BOTH") {
      // tRPC may hand us serialized dates; normalize before storing.
      const dateRange = options.dateRange
        ? {
            start: new Date(options.dateRange.start),
            end: new Date(options.dateRange.end),
          }
        : {
            start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
            end: new Date(),
          };
      metadata.dateRange = {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      };
    }

    const batch = await db.contactImportBatch.create({
      data: {
        workspaceId,
        createdById: userId,
        source,
        status: "IN_PROGRESS",
        metadata,
      },
    });

    return batch.id;
  }

  /**
   * Run one bounded slice of the import synchronously and roll its counts
   * into the batch. Steps arrive sequentially from one client, so plain
   * read-modify-write on the batch row is safe. Throws (for the router to
   * translate) when the batch doesn't exist, belongs elsewhere, or is
   * already finished; a thrown step leaves the batch IN_PROGRESS with its
   * cursor intact, so the client's retry resumes where it stopped.
   */
  static async processImportStep(
    batchId: string,
    userId: string,
    workspaceId: string,
    userEmail?: string
  ): Promise<ImportStepResult> {
    const batch = await db.contactImportBatch.findUnique({
      where: { id: batchId },
    });
    if (
      !batch ||
      batch.workspaceId !== workspaceId ||
      !["GMAIL", "CALENDAR", "BOTH"].includes(batch.source)
    ) {
      throw new Error("Import batch not found");
    }
    if (batch.status !== "IN_PROGRESS") {
      throw new Error("This import has already finished");
    }

    const cursor = cursorOf(batch.metadata);
    if (!cursor) {
      throw new Error("This import has no resume point — start a new import");
    }

    const priorErrors = recordedErrorsOf(batch.metadata);
    const source = batch.source as ImportSource;

    const counters =
      cursor.phase === "GMAIL"
        ? await this.runGmailStep(cursor, source, userId, workspaceId, priorErrors.length)
        : await this.runCalendarStep(
            cursor,
            batch.metadata,
            userId,
            workspaceId,
            userEmail,
            priorErrors.length
          );

    const allErrors = [...priorErrors, ...counters.newErrors];
    const completed = counters.nextCursor === null;
    const errorCount = batch.errorCount + counters.errorCount;
    const status = completed
      ? errorCount > 0
        ? "PARTIAL_SUCCESS"
        : "COMPLETED"
      : "IN_PROGRESS";

    const metadata: Prisma.JsonObject = {};
    const storedDateRange = dateRangeOf(batch.metadata);
    if (storedDateRange) {
      metadata.dateRange = {
        start: storedDateRange.start.toISOString(),
        end: storedDateRange.end.toISOString(),
      };
    }
    if (allErrors.length > 0) metadata.errors = allErrors;
    if (counters.nextCursor) metadata.cursor = { ...counters.nextCursor };

    const updatedBatch = await db.contactImportBatch.update({
      where: { id: batch.id },
      data: {
        status,
        // No fixed denominator exists for a stepped Google import (calendar
        // contacts are discovered page by page), so total tracks processed.
        totalContacts: batch.totalContacts + counters.processed,
        processedContacts: batch.processedContacts + counters.processed,
        newContacts: batch.newContacts + counters.created,
        updatedContacts: batch.updatedContacts + counters.updated,
        errorCount,
        metadata,
        ...(completed ? { completedAt: new Date() } : {}),
      },
    });

    return {
      batchId: updatedBatch.id,
      status: updatedBatch.status,
      phase: counters.nextCursor?.phase ?? null,
      totalContacts: updatedBatch.totalContacts,
      processedContacts: updatedBatch.processedContacts,
      newContacts: updatedBatch.newContacts,
      updatedContacts: updatedBatch.updatedContacts,
      errorCount: updatedBatch.errorCount,
      errors: allErrors,
      completed,
    };
  }

  /**
   * One GMAIL step: one People API page, upserted contact by contact.
   */
  private static async runGmailStep(
    cursor: ImportCursor,
    source: ImportSource,
    userId: string,
    workspaceId: string,
    priorErrorCount: number
  ): Promise<StepCounters> {
    const { contacts, nextPageToken } = await GoogleContactsService.fetchContacts(
      userId,
      cursor.pageToken,
      GMAIL_PAGE_SIZE
    );

    let created = 0;
    let updated = 0;
    let errorCount = 0;
    const newErrors: string[] = [];

    const recordError = (label: string, message: string) => {
      errorCount++;
      if (priorErrorCount + newErrors.length < MAX_RECORDED_ERRORS) {
        newErrors.push(`${label}: ${message}`);
      }
    };

    for (const googleContact of contacts) {
      const label =
        googleContact.names?.[0]?.displayName ?? "A Google contact";
      try {
        const contactInfo = GoogleContactsService.transformContact(googleContact);
        if (!contactInfo) {
          recordError(label, "no email address");
          continue;
        }

        const result = await this.findOrCreateContact(
          workspaceId,
          userId,
          contactInfo,
          "GMAIL"
        );

        if (result === "created") created++;
        else if (result === "updated") updated++;
      } catch (error) {
        console.error("Error processing Gmail contact:", error);
        recordError(
          label,
          error instanceof Error ? error.message : "unexpected error"
        );
      }
    }

    const nextCursor: ImportCursor | null = nextPageToken
      ? { phase: "GMAIL", pageToken: nextPageToken }
      : source === "BOTH"
        ? { phase: "CALENDAR" }
        : null;

    return {
      processed: contacts.length,
      created,
      updated,
      errorCount,
      newErrors,
      nextCursor,
    };
  }

  /**
   * One CALENDAR step: fetch the cursor's events page, extract its external
   * attendees, and process contacts from `contactOffset` until the pair
   * budget is spent — the remainder of a heavy page carries over to the
   * next step. Contacts recurring across pages are re-processed cheaply
   * (dedup makes it a no-op), which slightly inflates the processed count
   * relative to unique people.
   */
  private static async runCalendarStep(
    cursor: ImportCursor,
    batchMetadata: Prisma.JsonValue,
    userId: string,
    workspaceId: string,
    userEmail: string | undefined,
    priorErrorCount: number
  ): Promise<StepCounters> {
    const dateRange = dateRangeOf(batchMetadata);
    if (!dateRange) {
      throw new Error("This import has no date range — start a new import");
    }

    const { events, nextPageToken } =
      await GoogleContactsService.fetchCalendarEventsPage(
        userId,
        dateRange.start,
        dateRange.end,
        cursor.pageToken,
        CALENDAR_EVENTS_PER_PAGE
      );

    // Deterministic (Map insertion order), so the offset is stable when a
    // split page is re-fetched by the same token on the next step.
    const pageContacts = GoogleContactsService.extractContactsFromEvents(
      events,
      userEmail ?? ""
    );

    const offset = cursor.contactOffset ?? 0;
    let sliceEnd = offset;
    let pairs = 0;
    while (
      sliceEnd < pageContacts.length &&
      (sliceEnd === offset || pairs < CALENDAR_STEP_PAIR_BUDGET)
    ) {
      pairs += Math.max(
        1,
        GoogleContactsService.getEventsForContact(
          events,
          pageContacts[sliceEnd]!.email
        ).length
      );
      sliceEnd++;
    }

    let created = 0;
    let updated = 0;
    let errorCount = 0;
    const newErrors: string[] = [];

    for (const contactInfo of pageContacts.slice(offset, sliceEnd)) {
      try {
        const result = await this.findOrCreateContact(
          workspaceId,
          userId,
          contactInfo,
          "CALENDAR"
        );

        if (result === "created") created++;
        else if (result === "updated") updated++;

        const contactEvents = GoogleContactsService.getEventsForContact(
          events,
          contactInfo.email
        );

        await this.createInteractionsForContact(
          workspaceId,
          userId,
          contactInfo.email,
          contactEvents
        );
      } catch (error) {
        console.error("Error processing calendar contact:", error);
        errorCount++;
        if (priorErrorCount + newErrors.length < MAX_RECORDED_ERRORS) {
          const label =
            [contactInfo.firstName, contactInfo.lastName]
              .filter(Boolean)
              .join(" ") || "A calendar contact";
          newErrors.push(
            `${label}: ${error instanceof Error ? error.message : "unexpected error"}`
          );
        }
      }
    }

    const nextCursor: ImportCursor | null =
      sliceEnd < pageContacts.length
        ? { phase: "CALENDAR", pageToken: cursor.pageToken, contactOffset: sliceEnd }
        : nextPageToken
          ? { phase: "CALENDAR", pageToken: nextPageToken }
          : null;

    return {
      processed: sliceEnd - offset,
      created,
      updated,
      errorCount,
      newErrors,
      nextCursor,
    };
  }

  /**
   * Find existing contact or create new one
   */
  private static async findOrCreateContact(
    workspaceId: string,
    userId: string,
    contactInfo: ContactInfo,
    source: "GMAIL" | "CALENDAR"
  ): Promise<"created" | "updated" | "unchanged"> {
    const emailHash = this.generateEmailHash(contactInfo.email);

    // Encrypt PII fields
    const encryptedEmail = encryptString(contactInfo.email);
    const encryptedPhone = contactInfo.phone
      ? encryptString(contactInfo.phone)
      : null;
    const encryptedLinkedIn = contactInfo.linkedIn
      ? encryptString(contactInfo.linkedIn)
      : null;

    // Try to find existing contact by email hash
    const existing = await db.crmContact.findFirst({
      where: {
        workspaceId,
        emailHash,
      },
    });

    if (existing) {
      // Update existing contact
      const updateData: Record<string, unknown> = {
        lastSyncedAt: new Date(),
      };

      // Only update fields if they're empty or from a better source (Gmail > Calendar)
      if (!existing.firstName && contactInfo.firstName) {
        updateData.firstName = contactInfo.firstName;
      }
      if (!existing.lastName && contactInfo.lastName) {
        updateData.lastName = contactInfo.lastName;
      }
      if (!existing.phone && encryptedPhone) {
        updateData.phone = encryptedPhone;
      }
      if (!existing.linkedIn && encryptedLinkedIn) {
        updateData.linkedIn = encryptedLinkedIn;
      }
      if (source === "GMAIL" && contactInfo.googleContactId) {
        updateData.googleContactId = contactInfo.googleContactId;
      }

      // Update import source if coming from Gmail (higher priority)
      if (source === "GMAIL" && existing.importSource !== "GMAIL") {
        updateData.importSource = source;
      }

      if (Object.keys(updateData).length > 1) {
        // More than just lastSyncedAt
        await db.crmContact.update({
          where: { id: existing.id },
          data: updateData,
        });
        return "updated";
      }

      return "unchanged";
    }

    // Create new contact
    await db.crmContact.create({
      data: {
        workspaceId,
        createdById: userId,
        firstName: contactInfo.firstName,
        lastName: contactInfo.lastName,
        email: encryptedEmail,
        phone: encryptedPhone,
        linkedIn: encryptedLinkedIn,
        emailHash,
        importSource: source,
        googleContactId: contactInfo.googleContactId,
        lastSyncedAt: new Date(),
        connectionScore: 0, // Will be calculated later
      },
    });

    return "created";
  }

  /**
   * Create interactions from calendar events
   */
  private static async createInteractionsForContact(
    workspaceId: string,
    userId: string,
    email: string,
    events: GoogleCalendarEvent[]
  ): Promise<void> {
    // Find contact by email hash
    const emailHash = this.generateEmailHash(email);
    const contact = await db.crmContact.findFirst({
      where: {
        workspaceId,
        emailHash,
      },
    });

    if (!contact) {
      console.warn(`Contact not found for email hash: ${emailHash}`);
      return;
    }

    // Create interaction records for each event
    for (const event of events) {
      const startTime = GoogleContactsService.getEventStartTime(event);
      if (!startTime) continue;

      const duration = GoogleContactsService.calculateEventDuration(event);

      try {
        // Check if interaction already exists for this event
        const existing = await db.crmContactInteraction.findFirst({
          where: {
            contactId: contact.id,
            metadata: {
              path: ["googleEventId"],
              equals: event.id,
            },
          },
        });

        if (!existing) {
          await db.crmContactInteraction.create({
            data: {
              contactId: contact.id,
              workspaceId,
              userId,
              type: "MEETING",
              direction: "BIDIRECTIONAL",
              subject: event.summary ?? "Calendar Event",
              notes: event.description,
              occurredAt: startTime,
              metadata: {
                googleEventId: event.id,
                duration,
                source: "google_calendar",
              },
            },
          });

          // Update contact's last interaction time
          await db.crmContact.update({
            where: { id: contact.id },
            data: {
              lastInteractionAt: startTime,
              lastInteractionType: "MEETING",
            },
          });
        }
      } catch (error) {
        console.error("Error creating interaction:", error);
      }
    }

    // Calculate connection score for this contact
    try {
      const score = await ConnectionStrengthCalculator.calculateScore(contact.id);
      await db.crmContact.update({
        where: { id: contact.id },
        data: { connectionScore: score },
      });
    } catch (error) {
      console.error("Error calculating connection score:", error);
    }
  }

  /**
   * Generate SHA-256 hash of email for deduplication
   */
  private static generateEmailHash(email: string): string {
    const normalized = email.toLowerCase().trim();
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Recalculate connection scores for all contacts in a workspace
   */
  static async recalculateAllScores(workspaceId: string): Promise<void> {
    const contacts = await db.crmContact.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    console.log(`Recalculating scores for ${contacts.length} contacts...`);

    for (const contact of contacts) {
      try {
        const score = await ConnectionStrengthCalculator.calculateScore(
          contact.id
        );
        await db.crmContact.update({
          where: { id: contact.id },
          data: { connectionScore: score },
        });
      } catch (error) {
        console.error(
          `Error recalculating score for contact ${contact.id}:`,
          error
        );
      }
    }

    console.log("✅ Score recalculation complete");
  }
}

function metadataObjectOf(
  metadata: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function cursorOf(metadata: Prisma.JsonValue | null): ImportCursor | null {
  const cursor = metadataObjectOf(metadata)?.cursor;
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    return null;
  }
  const { phase, pageToken, contactOffset } = cursor as {
    phase?: unknown;
    pageToken?: unknown;
    contactOffset?: unknown;
  };
  if (phase !== "GMAIL" && phase !== "CALENDAR") return null;
  return {
    phase,
    pageToken: typeof pageToken === "string" ? pageToken : undefined,
    contactOffset:
      typeof contactOffset === "number" ? contactOffset : undefined,
  };
}

function dateRangeOf(
  metadata: Prisma.JsonValue | null
): { start: Date; end: Date } | null {
  const range = metadataObjectOf(metadata)?.dateRange;
  if (!range || typeof range !== "object" || Array.isArray(range)) return null;
  const { start, end } = range as { start?: unknown; end?: unknown };
  if (typeof start !== "string" || typeof end !== "string") return null;
  const parsed = { start: new Date(start), end: new Date(end) };
  if (isNaN(parsed.start.getTime()) || isNaN(parsed.end.getTime())) return null;
  return parsed;
}

function recordedErrorsOf(metadata: Prisma.JsonValue | null): string[] {
  const errors = metadataObjectOf(metadata)?.errors;
  return Array.isArray(errors)
    ? errors.filter((e): e is string => typeof e === "string")
    : [];
}
