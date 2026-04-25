import { db } from "~/server/db";
import { GoogleContactsService, type ContactInfo } from "./GoogleContactsService";
import { ConnectionStrengthCalculator } from "./ConnectionStrengthCalculator";
import { encryptString } from "~/server/utils/encryption";
import crypto from "crypto";

export interface ImportOptions {
  dateRange?: {
    start: Date;
    end: Date;
  };
  userEmail?: string;
}

export type ImportSource = "GMAIL" | "CALENDAR" | "BOTH";

export class ContactSyncService {
  /**
   * Main import orchestration
   */
  static async importContacts(
    workspaceId: string,
    userId: string,
    source: ImportSource,
    options: ImportOptions = {}
  ): Promise<string> {
    // Create import batch record
    const batch = await db.contactImportBatch.create({
      data: {
        workspaceId,
        createdById: userId,
        source,
        status: "PENDING",
      },
    });

    // Start async import (in real production, use a job queue like BullMQ)
    // For now, we'll run it immediately but this should be a background job
    this.processImportBatch(batch.id, userId, workspaceId, source, options)
      .catch((error) => {
        console.error("Import batch failed:", error);
        // Update batch status to FAILED
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

  /**
   * Process import batch (this would be a background job in production)
   */
  private static async processImportBatch(
    batchId: string,
    userId: string,
    workspaceId: string,
    source: ImportSource,
    options: ImportOptions
  ): Promise<void> {
    try {
      // Update status to IN_PROGRESS
      await db.contactImportBatch.update({
        where: { id: batchId },
        data: { status: "IN_PROGRESS" },
      });

      let totalContacts = 0;
      let newContacts = 0;
      let updatedContacts = 0;
      let errorCount = 0;

      // Process Gmail contacts
      if (source === "GMAIL" || source === "BOTH") {
        const result = await this.processGmailContacts(
          batchId,
          userId,
          workspaceId
        );
        totalContacts += result.total;
        newContacts += result.new;
        updatedContacts += result.updated;
        errorCount += result.errors;
      }

      // Process Calendar contacts
      if (source === "CALENDAR" || source === "BOTH") {
        // Ensure dateRange values are Date objects (tRPC might serialize them as strings)
        const dateRange = options.dateRange
          ? {
              start: new Date(options.dateRange.start),
              end: new Date(options.dateRange.end),
            }
          : {
              start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
              end: new Date(),
            };

        const result = await this.processCalendarContacts(
          batchId,
          userId,
          workspaceId,
          dateRange,
          options.userEmail
        );
        totalContacts += result.total;
        newContacts += result.new;
        updatedContacts += result.updated;
        errorCount += result.errors;
      }

      // Update batch with final counts
      await db.contactImportBatch.update({
        where: { id: batchId },
        data: {
          status: errorCount > 0 ? "PARTIAL_SUCCESS" : "COMPLETED",
          totalContacts,
          processedContacts: totalContacts,
          newContacts,
          updatedContacts,
          errorCount,
          completedAt: new Date(),
        },
      });

      console.log(`✅ Import batch ${batchId} completed:`, {
        totalContacts,
        newContacts,
        updatedContacts,
        errorCount,
      });
    } catch (error) {
      console.error("Import batch processing error:", error);
      throw error;
    }
  }

  /**
   * Process Gmail contacts via Google People API
   */
  private static async processGmailContacts(
    batchId: string,
    userId: string,
    workspaceId: string
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    let total = 0;
    let newCount = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log("📧 Fetching Gmail contacts...");
      const googleContacts = await GoogleContactsService.fetchAllContacts(userId);

      total = googleContacts.length;
      console.log(`Found ${total} Gmail contacts`);

      // Update batch progress
      await db.contactImportBatch.update({
        where: { id: batchId },
        data: { totalContacts: total },
      });

      for (const googleContact of googleContacts) {
        try {
          const contactInfo = GoogleContactsService.transformContact(googleContact);
          if (!contactInfo) {
            errors++;
            continue;
          }

          const result = await this.findOrCreateContact(
            workspaceId,
            userId,
            contactInfo,
            "GMAIL"
          );

          if (result === "created") {
            newCount++;
          } else if (result === "updated") {
            updated++;
          }

          // Update progress
          await db.contactImportBatch.update({
            where: { id: batchId },
            data: {
              processedContacts: newCount + updated + errors,
              newContacts: newCount,
              updatedContacts: updated,
              errorCount: errors,
            },
          });
        } catch (error) {
          console.error("Error processing Gmail contact:", error);
          errors++;
        }
      }
    } catch (error) {
      console.error("Error fetching Gmail contacts:", error);
      throw error;
    }

    return { total, new: newCount, updated, errors };
  }

  /**
   * Process Calendar contacts and interactions
   */
  private static async processCalendarContacts(
    batchId: string,
    userId: string,
    workspaceId: string,
    dateRange: { start: Date; end: Date },
    userEmail?: string
  ): Promise<{ total: number; new: number; updated: number; errors: number }> {
    let total = 0;
    let newCount = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log("📅 Fetching calendar events...");
      const events = await GoogleContactsService.fetchCalendarEvents(
        userId,
        dateRange.start,
        dateRange.end
      );

      console.log(`Found ${events.length} calendar events`);

      // Extract unique contacts from events
      const contacts = GoogleContactsService.extractContactsFromEvents(
        events,
        userEmail ?? ""
      );

      total = contacts.length;
      console.log(`Extracted ${total} unique contacts from calendar`);

      // Update batch progress
      await db.contactImportBatch.update({
        where: { id: batchId },
        data: { totalContacts: total },
      });

      for (const contactInfo of contacts) {
        try {
          const result = await this.findOrCreateContact(
            workspaceId,
            userId,
            contactInfo,
            "CALENDAR"
          );

          if (result === "created") {
            newCount++;
          } else if (result === "updated") {
            updated++;
          }

          // Create interactions for this contact
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

          // Update progress
          await db.contactImportBatch.update({
            where: { id: batchId },
            data: {
              processedContacts: newCount + updated + errors,
              newContacts: newCount,
              updatedContacts: updated,
              errorCount: errors,
            },
          });
        } catch (error) {
          console.error("Error processing calendar contact:", error);
          errors++;
        }
      }
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      throw error;
    }

    return { total, new: newCount, updated, errors };
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
    events: Array<{
      id: string;
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>
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
      const startTime = GoogleContactsService.getEventStartTime(event as never);
      if (!startTime) continue;

      const duration = GoogleContactsService.calculateEventDuration(event as never);

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
