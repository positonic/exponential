import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";

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
  about: z.string().optional(),
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
  about: z.string().optional(),
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
      })
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
                  { email: { contains: search, mode: "insensitive" } },
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

      let nextCursor: string | undefined;
      if (contacts.length > limit) {
        const nextItem = contacts.pop();
        nextCursor = nextItem?.id;
      }

      return {
        contacts,
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
      })
    )
    .query(async ({ ctx, input }) => {
      const { id, includeInteractions, includeCommunications } = input;

      const contact = await ctx.db.crmContact.findUnique({
        where: { id },
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      // Verify user has access to this contact's workspace
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

      return contact;
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

      const contact = await ctx.db.crmContact.create({
        data: {
          ...contactData,
          workspaceId,
          createdById: ctx.session.user.id,
          skills: contactData.skills ?? [],
          tags: contactData.tags ?? [],
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
        },
      });

      return contact;
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

      const contact = await ctx.db.crmContact.update({
        where: { id },
        data: updateData,
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

      return contact;
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
      })
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
            metadata: interactionData.metadata as Prisma.InputJsonValue | undefined,
            contactId,
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
      })
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
      })
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
});
