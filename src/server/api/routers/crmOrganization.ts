import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Input schemas
const createOrganizationInput = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  websiteUrl: z.string().url().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  description: z.string().optional(),
  industry: z.string().optional(),
  size: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]).optional(),
});

const updateOrganizationInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  websiteUrl: z.string().url().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  description: z.string().optional(),
  industry: z.string().optional(),
  size: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]).optional().nullable(),
});

export const crmOrganizationRouter = createTRPCRouter({
  // Get all organizations for a workspace
  getAll: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        includeContacts: z.boolean().optional(),
        search: z.string().optional(),
        industry: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        workspaceId,
        includeContacts,
        search,
        industry,
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
        include: {
          contacts: includeContacts
            ? {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  lastInteractionAt: true,
                },
                orderBy: { lastInteractionAt: { sort: "desc", nulls: "last" } },
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
          _count: {
            select: {
              contacts: true,
            },
          },
        },
        orderBy: { name: "asc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (organizations.length > limit) {
        const nextItem = organizations.pop();
        nextCursor = nextItem?.id;
      }

      return {
        organizations,
        nextCursor,
      };
    }),

  // Get a single organization by ID
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        includeContacts: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { id, includeContacts } = input;

      const organization = await ctx.db.crmOrganization.findUnique({
        where: { id },
        include: {
          contacts: includeContacts
            ? {
                include: {
                  interactions: {
                    orderBy: { createdAt: "desc" },
                    take: 3,
                  },
                },
                orderBy: { lastInteractionAt: { sort: "desc", nulls: "last" } },
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
          _count: {
            select: {
              contacts: true,
            },
          },
        },
      });

      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      // Verify user has access to this organization's workspace
      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: organization.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this organization",
        });
      }

      return organization;
    }),

  // Create a new organization
  create: protectedProcedure
    .input(createOrganizationInput)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, ...organizationData } = input;

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

      const organization = await ctx.db.crmOrganization.create({
        data: {
          ...organizationData,
          workspaceId,
          createdById: ctx.session.user.id,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          _count: {
            select: {
              contacts: true,
            },
          },
        },
      });

      return organization;
    }),

  // Update an organization
  update: protectedProcedure
    .input(updateOrganizationInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Get the organization and verify access
      const existingOrganization = await ctx.db.crmOrganization.findUnique({
        where: { id },
        select: { workspaceId: true },
      });

      if (!existingOrganization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: existingOrganization.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this organization",
        });
      }

      const organization = await ctx.db.crmOrganization.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          _count: {
            select: {
              contacts: true,
            },
          },
        },
      });

      return organization;
    }),

  // Delete an organization
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      // Get the organization and verify access
      const existingOrganization = await ctx.db.crmOrganization.findUnique({
        where: { id },
        select: { workspaceId: true, _count: { select: { contacts: true } } },
      });

      if (!existingOrganization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      const workspaceAccess = await ctx.db.workspaceUser.findFirst({
        where: {
          workspaceId: existingOrganization.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      if (!workspaceAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this organization",
        });
      }

      // Note: Contacts will have their organizationId set to null (onDelete: SetNull)
      await ctx.db.crmOrganization.delete({
        where: { id },
      });

      return {
        success: true,
        contactsUnlinked: existingOrganization._count.contacts,
      };
    }),

  // Get organization statistics for a workspace
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

      const [totalOrganizations, organizationsByIndustry, topOrganizations] =
        await Promise.all([
          ctx.db.crmOrganization.count({ where: { workspaceId } }),
          ctx.db.crmOrganization.groupBy({
            by: ["industry"],
            where: { workspaceId, industry: { not: null } },
            _count: { industry: true },
          }),
          ctx.db.crmOrganization.findMany({
            where: { workspaceId },
            include: {
              _count: {
                select: { contacts: true },
              },
            },
            orderBy: {
              contacts: {
                _count: "desc",
              },
            },
            take: 5,
          }),
        ]);

      return {
        totalOrganizations,
        organizationsByIndustry: organizationsByIndustry.map((item) => ({
          industry: item.industry ?? "Unknown",
          count: item._count.industry,
        })),
        topOrganizations: topOrganizations.map((org) => ({
          id: org.id,
          name: org.name,
          contactCount: org._count.contacts,
        })),
      };
    }),

  // Get unique industries in workspace (for filtering)
  getIndustries: protectedProcedure
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

      const industries = await ctx.db.crmOrganization.findMany({
        where: {
          workspaceId,
          industry: { not: null },
        },
        select: { industry: true },
        distinct: ["industry"],
      });

      return industries
        .map((item) => item.industry)
        .filter((industry): industry is string => industry !== null);
    }),
});
