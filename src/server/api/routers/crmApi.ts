import { z } from "zod";
import { createTRPCRouter } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { encryptString, decryptBuffer } from "~/server/utils/encryption";
import { Prisma } from "@prisma/client";
import type { CrmContact, PrismaClient } from "@prisma/client";
import { getProjectAccess, hasProjectAccess } from "~/server/services/access";
import { emailHashFor } from "~/server/services/crm/createCrmContact";
import {
  dispatchContactEnrichment,
  enqueueContactEnrichment,
} from "~/server/services/crm/enrichment/dispatchContactEnrichment";

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

async function getPipelineForWorkspace(
  db: PrismaClient,
  workspaceId: string,
  userId?: string,
  pipelineId?: string,
) {
  // A workspace may hold N pipelines (ADR-0033). Target a specific one when
  // pipelineId is supplied; otherwise default to the oldest (the stable default
  // the single-pipeline contract used to imply) so existing API callers keep
  // working without choosing a pipeline.
  const pipeline = await db.project.findFirst({
    where: {
      workspaceId,
      type: "pipeline",
      ...(pipelineId ? { id: pipelineId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!pipeline) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: pipelineId
        ? "Pipeline not found in this workspace."
        : "No pipeline found for this workspace. Create one first via the UI.",
    });
  }
  // If a user is supplied, verify they have access to the pipeline project
  // (covers the rare case of a workspace-scoped pipeline being restricted).
  if (userId) {
    const access = await getProjectAccess(db, userId, pipeline.id);
    if (!hasProjectAccess(access)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to this pipeline",
      });
    }
  }
  return pipeline;
}

// Find an existing organization by name (case-insensitive, workspace-scoped)
// or create it. Lets callers link a contact to an org by name in one call
// without a separate lookup — the CLI/SDK's `organizationName` convenience.
async function resolveOrganizationByName(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const existing = await db.crmOrganization.findFirst({
    where: { workspaceId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.crmOrganization.create({
    data: { workspaceId, name: trimmed, createdById: userId },
    select: { id: true },
  });
  return created.id;
}

// ─── Input Schemas ──────────────────────────────────────────────────

const piiFields = ["email", "phone", "linkedIn", "telegram", "twitter", "github", "bluesky"] as const;

const organizationSizeEnum = z.enum([
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+",
]);

const organizationCreateInput = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  websiteUrl: z.string().url().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  description: z.string().optional(),
  industry: z.string().optional(),
  size: organizationSizeEnum.optional(),
});

const organizationInclude = {
  createdBy: {
    select: { id: true, name: true, email: true, image: true },
  },
  _count: {
    select: { contacts: true },
  },
} as const;

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
  // Link (or find-or-create) an organization by name. Ignored when
  // organizationId is supplied — the explicit id always wins.
  organizationName: z.string().optional(),
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
  // Link (or find-or-create) an organization by name. Ignored when
  // organizationId is supplied — the explicit id always wins.
  organizationName: z.string().optional(),
});

// ─── Router ─────────────────────────────────────────────────────────

export const crmApiRouter = createTRPCRouter({
  // ─── Contacts ───────────────────────────────────────────────────

  contactList: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string(),
        search: z.string().optional(),
        email: z.string().email().optional(),
        tags: z.array(z.string()).optional(),
        organizationId: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, search, email, tags, organizationId, limit = 50, cursor } = input;
      await verifyWorkspaceAccess(ctx.db, workspaceId, ctx.userId);

      // When `email` is supplied, dedupe lookup via the globally-unique emailHash.
      // Contacts created before emailHash was set on the public API will not match.
      const emailHash = email ? emailHashFor(email) : undefined;

      const contacts = await ctx.db.crmContact.findMany({
        where: {
          workspaceId,
          ...(emailHash ? { emailHash } : {}),
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
      const { workspaceId, organizationName, ...contactData } = input;
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
      } else if (organizationName?.trim()) {
        // No explicit id — find-or-create the org by name in this workspace.
        contactData.organizationId = await resolveOrganizationByName(
          ctx.db,
          workspaceId,
          ctx.userId,
          organizationName,
        );
      }

      const contactInclude = {
        organization: true,
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
      } as const;

      // Dedupe by (workspaceId, emailHash). Uniqueness is workspace-scoped:
      // the same person can legitimately be a contact in more than one
      // workspace, but a single workspace should only ever hold one row per
      // email. Same-workspace resubmits return the existing row untouched (no
      // field overwrite) so callers distinguish via `wasExisting`.
      const trimmedEmail = contactData.email?.trim();
      const emailHash = trimmedEmail ? emailHashFor(trimmedEmail) : null;

      if (emailHash) {
        const existing = await ctx.db.crmContact.findUnique({
          where: { workspaceId_emailHash: { workspaceId, emailHash } },
          include: contactInclude,
        });
        if (existing) {
          return { ...safeDecryptContact(existing), wasExisting: true };
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
        ...(emailHash ? { emailHash } : {}),
      };

      for (const field of piiFields) {
        const value = contactData[field];
        if (value) dbData[field] = encryptString(value);
      }

      try {
        const contact = await ctx.db.crmContact.create({
          data: dbData as Parameters<typeof ctx.db.crmContact.create>[0]["data"],
          include: contactInclude,
        });
        // Opt-in async enrichment (no-op unless the workspace enabled it).
        await dispatchContactEnrichment(ctx.db, {
          contactId: contact.id,
          workspaceId,
          createdById: ctx.userId,
        });
        return { ...safeDecryptContact(contact), wasExisting: false };
      } catch (err) {
        // Concurrent double-submit: between the dedupe lookup above and this
        // insert, another request landed a row with the same
        // (workspaceId, emailHash). Re-fetch the winner and return it as a
        // dedupe hit so the caller still sees idempotent behaviour.
        if (
          emailHash &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const winner = await ctx.db.crmContact.findUniqueOrThrow({
            where: { workspaceId_emailHash: { workspaceId, emailHash } },
            include: contactInclude,
          });
          return { ...safeDecryptContact(winner), wasExisting: true };
        }
        throw err;
      }
    }),

  contactUpdate: apiKeyMiddleware
    .input(contactUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationName, ...updateData } = input;

      const existing = await ctx.db.crmContact.findUnique({
        where: { id },
        select: { workspaceId: true, aiSourcedFields: true },
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
      if (updateData.organizationId !== undefined) {
        dbUpdate.organizationId = updateData.organizationId;
      } else if (organizationName?.trim()) {
        // No explicit id — find-or-create the org by name in this workspace.
        dbUpdate.organizationId = await resolveOrganizationByName(
          ctx.db,
          existing.workspaceId,
          ctx.userId,
          organizationName,
        );
      }

      // PII fields - encrypt or null
      for (const field of piiFields) {
        const value = updateData[field];
        if (value !== undefined) {
          dbUpdate[field] = value ? encryptString(value) : null;
        }
      }

      // Human input is ground truth: any field edited here stops being
      // AI-sourced (ADR-0036). dbUpdate's keys are exactly the fields changed.
      const humanEditedKeys = Object.keys(dbUpdate);
      const nextAiSourced = existing.aiSourcedFields.filter(
        (f) => !humanEditedKeys.includes(f),
      );
      if (nextAiSourced.length !== existing.aiSourcedFields.length) {
        dbUpdate.aiSourcedFields = nextAiSourced;
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

  // Explicitly enqueue a web-search enrichment job for an existing contact.
  // Unlike the automatic path (which fires on create and is gated on the
  // workspace's enableAutoEnrichContacts flag), this is a deliberate user
  // action, so it forces the enqueue regardless of the flag. The
  // enrich-pending-contacts cron drains the PENDING row into Mastra's
  // enrichmentAgent. Idempotent: a contact with a job already PENDING/RUNNING is
  // not re-queued (that in-flight job's id is returned instead).
  contactEnrich: apiKeyMiddleware
    .input(z.object({ contactId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contact = await ctx.db.crmContact.findUnique({
        where: { id: input.contactId },
        select: { workspaceId: true },
      });
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      }
      await verifyWorkspaceAccess(ctx.db, contact.workspaceId, ctx.userId);

      return enqueueContactEnrichment(
        ctx.db,
        {
          contactId: input.contactId,
          workspaceId: contact.workspaceId,
          createdById: ctx.userId,
        },
        { force: true },
      );
    }),

  // ─── Organizations ──────────────────────────────────────────────

  organizationList: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string(),
        search: z.string().optional(),
        industry: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { workspaceId, search, industry, limit = 50, cursor } = input;
      await verifyWorkspaceAccess(ctx.db, workspaceId, ctx.userId);

      const organizations = await ctx.db.crmOrganization.findMany({
        where: {
          workspaceId,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { description: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(industry ? { industry } : {}),
        },
        include: organizationInclude,
        orderBy: { name: "asc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (organizations.length > limit) {
        organizations.pop();
        nextCursor = organizations[organizations.length - 1]?.id;
      }

      return { organizations, nextCursor };
    }),

  organizationGet: apiKeyMiddleware
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const organization = await ctx.db.crmOrganization.findFirst({
        where: {
          id: input.id,
          workspace: { members: { some: { userId: ctx.userId } } },
        },
        include: organizationInclude,
      });

      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found or inaccessible",
        });
      }

      return organization;
    }),

  organizationCreate: apiKeyMiddleware
    .input(organizationCreateInput)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...organizationData } = input;
      await verifyWorkspaceAccess(ctx.db, workspaceId, ctx.userId);

      const organization = await ctx.db.crmOrganization.create({
        data: {
          ...organizationData,
          workspaceId,
          createdById: ctx.userId,
        },
        include: organizationInclude,
      });

      return organization;
    }),

  // ─── Pipeline ───────────────────────────────────────────────────

  // List every pipeline in a workspace (multi-pipeline, ADR-0033) so API
  // callers can discover ids before targeting one with pipelineId.
  pipelineList: apiKeyMiddleware
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);

      const pipelines = await ctx.db.project.findMany({
        where: { workspaceId: input.workspaceId, type: "pipeline" },
        include: { pipelineStages: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "asc" },
      });

      const visible: typeof pipelines = [];
      for (const pipeline of pipelines) {
        const access = await getProjectAccess(ctx.db, ctx.userId, pipeline.id);
        if (hasProjectAccess(access)) visible.push(pipeline);
      }
      return visible;
    }),

  pipelineGet: apiKeyMiddleware
    .input(
      z.object({ workspaceId: z.string(), pipelineId: z.string().optional() }),
    )
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);

      const pipeline = await ctx.db.project.findFirst({
        where: {
          workspaceId: input.workspaceId,
          type: "pipeline",
          ...(input.pipelineId ? { id: input.pipelineId } : {}),
        },
        include: {
          pipelineStages: { orderBy: { order: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!pipeline) return null;
      const access = await getProjectAccess(ctx.db, ctx.userId, pipeline.id);
      if (!hasProjectAccess(access)) return null;
      return pipeline;
    }),

  pipelineGetStages: apiKeyMiddleware
    .input(
      z.object({ workspaceId: z.string(), pipelineId: z.string().optional() }),
    )
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);
      const pipeline = await getPipelineForWorkspace(
        ctx.db,
        input.workspaceId,
        ctx.userId,
        input.pipelineId,
      );

      return ctx.db.pipelineStage.findMany({
        where: { projectId: pipeline.id },
        orderBy: { order: "asc" },
        include: { _count: { select: { deals: true } } },
      });
    }),

  // ─── Deals ──────────────────────────────────────────────────────

  dealList: apiKeyMiddleware
    .input(
      z.object({ workspaceId: z.string(), pipelineId: z.string().optional() }),
    )
    .query(async ({ ctx, input }) => {
      await verifyWorkspaceAccess(ctx.db, input.workspaceId, ctx.userId);
      const pipeline = await getPipelineForWorkspace(
        ctx.db,
        input.workspaceId,
        ctx.userId,
        input.pipelineId,
      );

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
        pipelineId: z.string().optional(),
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
      const pipeline = await getPipelineForWorkspace(
        ctx.db,
        input.workspaceId,
        ctx.userId,
        input.pipelineId,
      );

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
