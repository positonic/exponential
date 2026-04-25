import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { encryptString, decryptBuffer } from "~/server/utils/encryption";
import type { Prisma, CrmContact } from "@prisma/client";
import { ContactSyncService } from "~/server/services/ContactSyncService";
import { ConnectionStrengthCalculator } from "~/server/services/ConnectionStrengthCalculator";
import { GoogleTokenManager } from "~/server/services/GoogleTokenManager";

// Type for decrypted contact - replaces Bytes fields with string | null
type DecryptedContact<T extends CrmContact> = Omit<
  T,
  "email" | "phone" | "linkedIn" | "telegram" | "twitter" | "github" | "bluesky"
> & {
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  telegram: string | null;
  twitter: string | null;
  github: string | null;
  bluesky: string | null;
};

// Helper to decrypt PII fields and return properly typed contact
function decryptContactPII<T extends CrmContact>(
  contact: T,
): DecryptedContact<T> {
  return {
    ...contact,
    email: decryptBuffer(contact.email) ?? null,
    phone: decryptBuffer(contact.phone) ?? null,
    linkedIn: decryptBuffer(contact.linkedIn) ?? null,
    telegram: decryptBuffer(contact.telegram) ?? null,
    twitter: decryptBuffer(contact.twitter) ?? null,
    github: decryptBuffer(contact.github) ?? null,
    bluesky: decryptBuffer(contact.bluesky) ?? null,
  };
}

// Input schemas
const createContactInput = z.object({
  workspaceId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional(),
  linkedIn: z.string().optional(),
  telegram: z.string().optional(),
  twitter: z.string().optional(),
  github: z.string().optional(),
  bluesky: z.string().optional(),
  about: z.string().optional(),
  profileType: z.string().optional(),
  skills: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  organizationId: z.string().optional(),
});

const updateContactInput = z.object({
  id: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional(),
  linkedIn: z.string().optional(),
  telegram: z.string().optional(),
  twitter: z.string().optional(),
  github: z.string().optional(),
  bluesky: z.string().optional(),
  about: z.string().optional(),
  profileType: z.string().optional(),
  skills: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  organizationId: z.string().optional().nullable(),
});

const addInteractionInput = z.object({
  contactId: z.string(),
  type: z.enum([
    "EMAIL",
    "TELEGRAM",
    "PHONE_CALL",
    "MEETING",
    "NOTE",
    "LINKEDIN",
    "OTHER",
  ]),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  subject: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.any().optional(), // JSON field - accepts any serializable value
});

export const crmContactRouter = createTRPCRouter({
  // Get all contacts for a workspace
  getAll: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        includeOrganization: z.boolean().optional(),
        includeInteractions: z.boolean().optional(),
        search: z.string().optional(),
        tags: z.array(z.string()).optional(),
        organizationId: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        workspaceId,
        includeOrganization,
        includeInteractions,
        search,
        tags,
        organizationId,
        limit = 50,
        cursor,
      } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      const contacts = await ctx.db.crmContact.findMany({
        where: {
          workspaceId,
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  // Note: email is encrypted and cannot be searched
                ],
              }
            : {}),
          ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
          ...(organizationId ? { organizationId } : {}),
        },
        include: {
          organization: includeOrganization ?? false,
          interactions: includeInteractions
            ? {
                orderBy: { createdAt: "desc" },
                take: 5,
              }
            : false,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: [
          { lastInteractionAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      // Decrypt PII fields before returning
      const decrypted = contacts.map((c) => {
        try {
          return decryptContactPII(c);
        } catch (e) {
          console.error("PII decryption failed for contact", c.id, e);
          // Return with null PII fields on decryption failure
          return {
            ...c,
            email: null,
            phone: null,
            linkedIn: null,
            telegram: null,
            twitter: null,
            github: null,
            bluesky: null,
          };
        }
      });

      let nextCursor: string | undefined;
      if (contacts.length > limit) {
        const nextItem = contacts.pop();
        nextCursor = nextItem?.id;
      }

      return {
        contacts: decrypted,
        nextCursor,
      };
    }),

  // Get a single contact by ID
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        includeInteractions: z.boolean().optional(),
        includeCommunications: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { id, includeInteractions, includeCommunications } = input;

      // Combine existence + access: only return the contact if the current user has workspace access
      const contact = await ctx.db.crmContact.findFirst({
        where: {
          id,
          workspace: { members: { some: { userId: ctx.session.user.id } } },
        },
        include: {
          organization: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          interactions: includeInteractions
            ? {
                orderBy: { createdAt: "desc" },
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      image: true,
                    },
                  },
                },
              }
            : false,
          communications: includeCommunications
            ? {
                orderBy: { createdAt: "desc" },
                take: 20,
              }
            : false,
        },
      });

      if (!contact) {
        // Return a single generic NOT_FOUND to avoid leaking existence or access details
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found or inaccessible",
        });
      }

      // Decrypt PII fields before returning
      try {
        return decryptContactPII(contact);
      } catch (e) {
        console.error("PII decryption failed for contact", contact.id, e);
        return {
          ...contact,
          email: null,
          phone: null,
          linkedIn: null,
          telegram: null,
          twitter: null,
          github: null,
          bluesky: null,
        };
      }
    }),

  // Create a new contact
  create: protectedProcedure
    .input(createContactInput)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...contactData } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      // If an organizationId is provided, ensure it belongs to the same workspace
      if (contactData.organizationId) {
        const organization = await ctx.db.crmOrganization.findUnique({
          where: { id: contactData.organizationId },
          select: { workspaceId: true },
        });

        if (!organization || organization.workspaceId !== workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Organization must belong to the same workspace",
          });
        }
      }

      // Prepare encrypted PII fields for storage
      const dbData: any = {
        workspaceId,
        createdById: ctx.session.user.id,
        skills: contactData.skills ?? [],
        tags: contactData.tags ?? [],
        firstName: contactData.firstName ?? undefined,
        lastName: contactData.lastName ?? undefined,
        about: contactData.about ?? undefined,
        profileType: contactData.profileType ?? undefined,
        organizationId: contactData.organizationId ?? undefined,
      };

      if (contactData.email) dbData.email = encryptString(contactData.email);
      if (contactData.phone) dbData.phone = encryptString(contactData.phone);
      if (contactData.linkedIn)
        dbData.linkedIn = encryptString(contactData.linkedIn);
      if (contactData.telegram)
        dbData.telegram = encryptString(contactData.telegram);
      if (contactData.twitter)
        dbData.twitter = encryptString(contactData.twitter);
      if (contactData.github) dbData.github = encryptString(contactData.github);
      if (contactData.bluesky)
        dbData.bluesky = encryptString(contactData.bluesky);

      const contact = await ctx.db.crmContact.create({
        data: dbData,
        include: {
          organization: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // Decrypt fields for the response
      try {
        return decryptContactPII(contact);
      } catch (e) {
        console.error(
          "PII decryption failed after create for contact",
          contact.id,
          e,
        );
        return {
          ...contact,
          email: null,
          phone: null,
          linkedIn: null,
          telegram: null,
          twitter: null,
          github: null,
          bluesky: null,
        };
      }
    }),

  // Update a contact
  update: protectedProcedure
    .input(updateContactInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Get the contact and verify access
      const existingContact = await ctx.db.crmContact.findUnique({
        where: { id },
        select: { workspaceId: true },
      });

      if (!existingContact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: existingContact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      // Encrypt any PII fields present in updateData
      const dbUpdate: any = { ...updateData };
      try {
        if (updateData.email !== undefined) {
          dbUpdate.email = updateData.email
            ? encryptString(updateData.email)
            : null;
        }
        if (updateData.phone !== undefined) {
          dbUpdate.phone = updateData.phone
            ? encryptString(updateData.phone)
            : null;
        }
        if (updateData.linkedIn !== undefined) {
          dbUpdate.linkedIn = updateData.linkedIn
            ? encryptString(updateData.linkedIn)
            : null;
        }
        if (updateData.telegram !== undefined) {
          dbUpdate.telegram = updateData.telegram
            ? encryptString(updateData.telegram)
            : null;
        }
        if (updateData.twitter !== undefined) {
          dbUpdate.twitter = updateData.twitter
            ? encryptString(updateData.twitter)
            : null;
        }
        if (updateData.github !== undefined) {
          dbUpdate.github = updateData.github
            ? encryptString(updateData.github)
            : null;
        }
        if (updateData.bluesky !== undefined) {
          dbUpdate.bluesky = updateData.bluesky
            ? encryptString(updateData.bluesky)
            : null;
        }
      } catch (e) {
        console.error("Failed to encrypt PII on update for contact", id, e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process PII",
        });
      }

      const contact = await ctx.db.crmContact.update({
        where: { id },
        data: dbUpdate,
        include: {
          organization: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // Decrypt for response
      try {
        return decryptContactPII(contact);
      } catch (e) {
        console.error(
          "PII decryption failed after update for contact",
          contact.id,
          e,
        );
        return {
          ...contact,
          email: null,
          phone: null,
          linkedIn: null,
          telegram: null,
          twitter: null,
          github: null,
          bluesky: null,
        };
      }
    }),

  // Delete a contact
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      // Get the contact and verify access
      const existingContact = await ctx.db.crmContact.findUnique({
        where: { id },
        select: { workspaceId: true },
      });

      if (!existingContact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: existingContact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      await ctx.db.crmContact.delete({
        where: { id },
      });

      return { success: true };
    }),

  // Bulk delete contacts
  bulkDelete: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        workspaceId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { ids, workspaceId } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      // Delete only contacts that belong to this workspace
      const result = await ctx.db.crmContact.deleteMany({
        where: {
          id: { in: ids },
          workspaceId,
        },
      });

      return { deletedCount: result.count };
    }),

  // Add an interaction to a contact
  addInteraction: protectedProcedure
    .input(addInteractionInput)
    .mutation(async ({ ctx, input }) => {
      const { contactId, ...interactionData } = input;

      // Get the contact and verify access
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: contactId },
        select: { workspaceId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: contact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      // Create interaction and update contact's last interaction
      const [interaction] = await ctx.db.$transaction([
        ctx.db.crmContactInteraction.create({
          data: {
            type: interactionData.type,
            direction: interactionData.direction,
            subject: interactionData.subject,
            notes: interactionData.notes,
            metadata: interactionData.metadata as
              | Prisma.InputJsonValue
              | undefined,
            contactId,
            workspaceId: contact.workspaceId,
            userId: ctx.session.user.id,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        }),
        ctx.db.crmContact.update({
          where: { id: contactId },
          data: {
            lastInteractionAt: new Date(),
            lastInteractionType: interactionData.type,
          },
        }),
      ]);

      return interaction;
    }),

  // Get interactions for a contact
  getInteractions: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { contactId, limit = 20, cursor } = input;

      // Get the contact and verify access
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: contactId },
        select: { workspaceId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: contact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      const interactions = await ctx.db.crmContactInteraction.findMany({
        where: { contactId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (interactions.length > limit) {
        const nextItem = interactions.pop();
        nextCursor = nextItem?.id;
      }

      return {
        interactions,
        nextCursor,
      };
    }),

  // Assign contact to organization
  assignToOrganization: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        organizationId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { contactId, organizationId } = input;

      // Get the contact and verify access
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: contactId },
        select: { workspaceId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: contact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      // If organizationId is provided, verify it belongs to the same workspace
      if (organizationId) {
        const organization = await ctx.db.crmOrganization.findUnique({
          where: { id: organizationId },
          select: { workspaceId: true },
        });

        if (!organization || organization.workspaceId !== contact.workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Organization must belong to the same workspace",
          });
        }
      }

      const updatedContact = await ctx.db.crmContact.update({
        where: { id: contactId },
        data: { organizationId },
        include: {
          organization: true,
        },
      });

      return updatedContact;
    }),

  // Get contact statistics for a workspace
  getStats: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      const [
        totalContacts,
        contactsWithOrganization,
        contactsWithEmail,
        recentInteractions,
      ] = await Promise.all([
        ctx.db.crmContact.count({ where: { workspaceId } }),
        ctx.db.crmContact.count({
          where: { workspaceId, organizationId: { not: null } },
        }),
        ctx.db.crmContact.count({
          where: { workspaceId, email: { not: null } },
        }),
        ctx.db.crmContactInteraction.count({
          where: {
            contact: { workspaceId },
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
        }),
      ]);

      return {
        totalContacts,
        contactsWithOrganization,
        contactsWithEmail,
        recentInteractions,
      };
    }),

  // Import contacts from Gmail/Calendar
  importContacts: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        source: z.enum(["GMAIL", "CALENDAR", "BOTH"]),
        dateRange: z
          .object({
            start: z.date(),
            end: z.date(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, source, dateRange } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      // Check if user has Google OAuth connection
      const connection = await GoogleTokenManager.getConnection(
        ctx.session.user.id
      );

      if (!connection) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Google OAuth connection not found. Please connect your Google account first.",
        });
      }

      // Get user's email for filtering calendar events
      const userEmail = ctx.session.user.email ?? undefined;

      // Start async import
      const batchId = await ContactSyncService.importContacts(
        workspaceId,
        ctx.session.user.id,
        source,
        { dateRange, userEmail },
      );

      return { batchId };
    }),

  // Get import batch status
  getImportStatus: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { batchId } = input;

      // Get the batch
      const batch = await ctx.db.contactImportBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import batch not found",
        });
      }

      // Verify user has access to the workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: batch.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this import batch",
        });
      }

      return batch;
    }),

  // Get Google OAuth connection status
  getGoogleConnection: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      const connection = await GoogleTokenManager.getConnection(
        ctx.session.user.id
      );

      if (!connection) {
        return null;
      }

      // Check if account has all required scopes
      const requiredScopes = [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ];

      const hasAllScopes = GoogleTokenManager.hasRequiredScopes(
        connection,
        requiredScopes
      );

      // Return connection info without tokens
      return {
        id: connection.id,
        provider: connection.provider,
        scope: connection.scope,
        expires_at: connection.expires_at,
        hasAllScopes,
        hasRefreshToken: !!connection.refresh_token,
      };
    }),

  // Recalculate connection score for a single contact
  recalculateScore: protectedProcedure
    .input(z.object({ contactId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { contactId } = input;

      // Get the contact and verify access
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: contactId },
        select: { workspaceId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: contact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      // Calculate and update score
      const score =
        await ConnectionStrengthCalculator.calculateScore(contactId);
      await ctx.db.crmContact.update({
        where: { id: contactId },
        data: { connectionScore: score },
      });

      return { score };
    }),

  // Get detailed score breakdown for a contact
  getScoreBreakdown: protectedProcedure
    .input(z.object({ contactId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { contactId } = input;

      // Get the contact and verify access
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: contactId },
        select: { workspaceId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: contact.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this contact",
        });
      }

      return await ConnectionStrengthCalculator.getScoreBreakdown(contactId);
    }),

  // Recalculate all scores for a workspace
  recalculateAllScores: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { workspaceId } = input;

      // Verify user has access to workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      // Start async recalculation (in production, this should be a background job)
      ContactSyncService.recalculateAllScores(workspaceId).catch((error) => {
        console.error("Error recalculating all scores:", error);
      });

      return { success: true, message: "Score recalculation started" };
    }),
});
