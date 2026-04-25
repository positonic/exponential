import { z } from "zod";
import { createTRPCRouter } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { encryptString, decryptBuffer } from "~/server/utils/encryption";
import type { CrmContact, PrismaClient } from "@prisma/client";

// ─── Helpers ────────────────────────────────────────────────────────

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

function decryptContactPII<T extends CrmContact>(contact: T): DecryptedContact<T> {
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

function safeDecryptContact<T extends CrmContact>(contact: T): DecryptedContact<T> {
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
}

async function verifyWorkspaceAccess(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
) {
  const access = await db.workspaceUser.findFirst({
    where: { workspaceId, userId },
  });
  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this workspace",
    });
  }
}

async function getPipelineForWorkspace(db: PrismaClient, workspaceId: string) {
  const pipeline = await db.project.findFirst({
    where: { workspaceId, type: "pipeline" },
  });
  if (!pipeline) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No pipeline found for this workspace. Create one first via the UI.",
    });
  }
  return pipeline;
}

// ─── Input Schemas ──────────────────────────────────────────────────

const piiFields = ["email", "phone", "linkedIn", "telegram", "twitter", "github", "bluesky"] as const;

const contactCreateInput = z.object({
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

const contactUpdateInput = z.object({
  id: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedIn: z.string().optional().nullable(),
  telegram: z.string().optional().nullable(),
  twitter: z.string().optional().nullable(),
  github: z.string().optional().nullable(),
  bluesky: z.string().optional().nullable(),
  about: z.string().optional(),
  profileType: z.string().optional(),
  skills: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  organizationId: z.string().optional().nullable(),
});

// ─── Router ─────────────────────────────────────────────────────────

export const crmApiRouter = createTRPCRouter({
  // ─── Contacts ───────────────────────────────────────────────────

  contactList: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string(),
        search: z.string().optional(),
        tags: z.array(z.string()).optional(),
        organizationId: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, search, tags, organizationId, limit = 50, cursor } = input;
      await verifyWorkspaceAccess(ctx.db, workspaceId, ctx.userId);

      const contacts = await ctx.db.crmContact.findMany({
        where: {
          workspaceId,
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
          ...(organizationId ? { organizationId } : {}),
        },
        include: {
          organization: true,
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
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
        contacts.pop();
        nextCursor = contacts[contacts.length - 1]?.id;
      }

      return {
        contacts: contacts.map(safeDecryptContact),
        nextCursor,
      };
    }),

  contactGet: apiKeyMiddleware
    .input(
      z.object({
        id: z.string(),
        includeInteractions: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const contact = await ctx.db.crmContact.findFirst({
        where: {
          id: input.id,
          workspace: { members: { some: { userId: ctx.userId } } },
        },
        include: {
          organization: true,
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
          interactions: input.includeInteractions
            ? {
                orderBy: { createdAt: "desc" as const },
                include: {
                  user: {
                    select: { id: true, name: true, email: true, image: true },
                  },
                },
              }
            : false,
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found or inaccessible",
        });
      }

      return safeDecryptContact(contact);
    }),

  contactCreate: apiKeyMiddleware
    .input(contactCreateInput)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...contactData } = input;
      await verifyWorkspaceAccess(ctx.db, workspaceId, ctx.userId);

      if (contactData.organizationId) {
        const org = await ctx.db.crmOrganization.findUnique({
          where: { id: contactData.organizationId },
          select: { workspaceId: true },
        });
        if (!org || org.workspaceId !== workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Organization must belong to the same workspace",
          });
        }
      }

      const dbData: Record<string, unknown> = {
        workspaceId,
        createdById: ctx.userId,
        skills: contactData.skills ?? [],
        tags: contactData.tags ?? [],
        firstName: contactData.firstName ?? undefined,
        lastName: contactData.lastName ?? undefined,
        about: contactData.about ?? undefined,
        profileType: contactData.profileType ?? undefined,
        organizationId: contactData.organizationId ?? undefined,
      };

      for (const field of piiFields) {
        const value = contactData[field];
        if (value) dbData[field] = encryptString(value);
      }

      const contact = await ctx.db.crmContact.create({
        data: dbData as Parameters<typeof ctx.db.crmContact.create>[0]["data"],
        include: {
          organization: true,
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

      return safeDecryptContact(contact);
    }),

  contactUpdate: apiKeyMiddleware
    .input(contactUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.db.crmContact.findUnique({
        where: { id },
        select: { workspaceId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      await verifyWorkspaceAccess(ctx.db, existing.workspaceId, ctx.userId);

      const dbUpdate: Record<string, unknown> = {};

      // Non-PII fields
      if (updateData.firstName !== undefined) dbUpdate.firstName = updateData.firstName;
      if (updateData.lastName !== undefined) dbUpdate.lastName = updateData.lastName;
      if (updateData.about !== undefined) dbUpdate.about = updateData.about;
      if (updateData.profileType !== undefined) dbUpdate.profileType = updateData.profileType;
      if (updateData.skills !== undefined) dbUpdate.skills = updateData.skills;
      if (updateData.tags !== undefined) dbUpdate.tags = updateData.tags;
      if (updateData.organizationId !== undefined) dbUpdate.organizationId = updateData.organizationId;

      // PII fields - encrypt or null
      for (const field of piiFields) {
        const value = updateData[field];
        if (value !== undefined) {
          dbUpdate[field] = value ? encryptString(value) : null;
        }
      }

      const contact = await ctx.db.crmContact.update({
        where: { id },
        data: dbUpdate as Parameters<typeof ctx.db.crmContact.update>[0]["data"],
        include: {
          organization: true,
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

      return safeDecryptContact(contact);
    }),

  contactDelete: apiKeyMiddleware
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: input.id },
        select: { workspaceId: true },
      });
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      await verifyWorkspaceAccess(ctx.db, contact.workspaceId, ctx.userId);

      await ctx.db.crmContact.delete({ where: { id: input.id } });
      return { success: true };
    }),

  contactAddInteraction: apiKeyMiddleware
    .input(
      z.object({
        contactId: z.string(),
        type: z.enum([
          "EMAIL", "TELEGRAM", "PHONE_CALL", "MEETING", "NOTE", "LINKEDIN", "OTHER",
        ]),
        direction: z.enum(["INBOUND", "OUTBOUND"]),
        subject: z.string().optional(),
        notes: z.string().optional(),
        metadata: z.any().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: input.contactId },
        select: { workspaceId: true },
      });
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      await verifyWorkspaceAccess(ctx.db, contact.workspaceId, ctx.userId);

      const interaction = await ctx.db.crmContactInteraction.create({
        data: {
          contactId: input.contactId,
          workspaceId: contact.workspaceId,
          userId: ctx.userId,
          type: input.type,
          direction: input.direction,
          subject: input.subject,
          notes: input.notes,
          metadata: input.metadata ?? undefined,
        },
      });

      // Update contact's last interaction
      await ctx.db.crmContact.update({
        where: { id: input.contactId },
        data: {
          lastInteractionAt: interaction.occurredAt,
          lastInteractionType: input.type,
        },
      });

      return interaction;
    }),

  // ─── Pipeline ───────────────────────────────────────────────────

  pipelineGet: apiKeyMiddleware
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.project.findFirst({
        where: { workspaceId: input.workspaceId, type: "pipeline" },
        include: {
          pipelineStages: { orderBy: { order: "asc" } },
        },
      });
    }),

  pipelineGetStages: apiKeyMiddleware
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);
      const pipeline = await getPipelineForWorkspace(ctx.db, input.workspaceId);

      return ctx.db.pipelineStage.findMany({
        where: { projectId: pipeline.id },
        orderBy: { order: "asc" },
        include: { _count: { select: { deals: true } } },
      });
    }),

  // ─── Deals ──────────────────────────────────────────────────────

  dealList: apiKeyMiddleware
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);
      const pipeline = await getPipelineForWorkspace(ctx.db, input.workspaceId);

      return ctx.db.deal.findMany({
        where: { projectId: pipeline.id },
        orderBy: [{ stageOrder: "asc" }, { createdAt: "asc" }],
        include: {
          stage: true,
          contact: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, image: true } },
        },
      });
    }),

  dealGet: apiKeyMiddleware
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deal = await ctx.db.deal.findUnique({
        where: { id: input.id },
        include: {
          stage: true,
          contact: { select: { id: true, firstName: true, lastName: true, organizationId: true } },
          organization: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, image: true, email: true } },
          activities: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      });

      if (!deal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      }
      await verifyWorkspaceAccess(ctx.db, deal.workspaceId, ctx.userId);

      return deal;
    }),

  dealCreate: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string(),
        stageId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        value: z.number().min(0).optional(),
        currency: z.string().default("USD"),
        probability: z.number().int().min(0).max(100).optional(),
        expectedCloseDate: z.date().optional(),
        contactId: z.string().optional(),
        organizationId: z.string().optional(),
        assignedToId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);
      const pipeline = await getPipelineForWorkspace(ctx.db, input.workspaceId);

      // Position at end of stage
      const lastDeal = await ctx.db.deal.findFirst({
        where: { projectId: pipeline.id, stageId: input.stageId },
        orderBy: { stageOrder: "desc" },
        select: { stageOrder: true },
      });
      const stageOrder = (lastDeal?.stageOrder ?? -1) + 1;

      const deal = await ctx.db.deal.create({
        data: {
          projectId: pipeline.id,
          stageId: input.stageId,
          title: input.title,
          description: input.description,
          value: input.value,
          currency: input.currency,
          probability: input.probability,
          expectedCloseDate: input.expectedCloseDate,
          contactId: input.contactId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          createdById: ctx.userId,
          assignedToId: input.assignedToId,
          stageOrder,
        },
        include: {
          stage: true,
          contact: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
        },
      });

      await ctx.db.dealActivity.create({
        data: {
          dealId: deal.id,
          userId: ctx.userId,
          type: "CREATED",
          content: `Deal "${deal.title}" created in ${deal.stage.name}`,
          metadata: { stageId: deal.stageId, stageName: deal.stage.name },
        },
      });

      return deal;
    }),

  dealUpdate: apiKeyMiddleware
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        value: z.number().min(0).nullable().optional(),
        currency: z.string().optional(),
        probability: z.number().int().min(0).max(100).nullable().optional(),
        expectedCloseDate: z.date().nullable().optional(),
        contactId: z.string().nullable().optional(),
        organizationId: z.string().nullable().optional(),
        assignedToId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const oldDeal = await ctx.db.deal.findUnique({
        where: { id },
        select: { value: true, workspaceId: true },
      });
      if (!oldDeal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      }
      await verifyWorkspaceAccess(ctx.db, oldDeal.workspaceId, ctx.userId);

      const deal = await ctx.db.deal.update({
        where: { id },
        data,
        include: {
          stage: true,
          contact: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
        },
      });

      if (input.value !== undefined && oldDeal.value !== input.value) {
        await ctx.db.dealActivity.create({
          data: {
            dealId: deal.id,
            userId: ctx.userId,
            type: "VALUE_CHANGE",
            content: `Value changed from ${oldDeal.value ?? 0} to ${input.value ?? 0}`,
            metadata: { oldValue: oldDeal.value, newValue: input.value },
          },
        });
      }

      return deal;
    }),

  dealMove: apiKeyMiddleware
    .input(
      z.object({
        id: z.string(),
        stageId: z.string(),
        stageOrder: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const oldDeal = await ctx.db.deal.findUnique({
        where: { id: input.id },
        include: { stage: true },
      });
      if (!oldDeal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      }
      await verifyWorkspaceAccess(ctx.db, oldDeal.workspaceId, ctx.userId);

      const newStage = await ctx.db.pipelineStage.findUniqueOrThrow({
        where: { id: input.stageId },
      });

      const isStageChange = oldDeal.stageId !== input.stageId;
      const isTerminal = newStage.type === "won" || newStage.type === "lost";

      const deal = await ctx.db.deal.update({
        where: { id: input.id },
        data: {
          stageId: input.stageId,
          stageOrder: input.stageOrder,
          ...(isTerminal && !oldDeal.closedAt ? { closedAt: new Date() } : {}),
          ...(!isTerminal && oldDeal.closedAt ? { closedAt: null } : {}),
        },
        include: { stage: true },
      });

      if (isStageChange) {
        await ctx.db.dealActivity.create({
          data: {
            dealId: deal.id,
            userId: ctx.userId,
            type: isTerminal ? "CLOSED" : "STAGE_CHANGE",
            content: `Moved from ${oldDeal.stage.name} to ${newStage.name}`,
            metadata: {
              fromStageId: oldDeal.stageId,
              fromStageName: oldDeal.stage.name,
              toStageId: input.stageId,
              toStageName: newStage.name,
            },
          },
        });
      }

      return deal;
    }),

  dealDelete: apiKeyMiddleware
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await ctx.db.deal.findUnique({
        where: { id: input.id },
        select: { workspaceId: true },
      });
      if (!deal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      }
      await verifyWorkspaceAccess(ctx.db, deal.workspaceId, ctx.userId);

      await ctx.db.deal.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
