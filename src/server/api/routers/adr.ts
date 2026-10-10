import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, humanOnlyProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access";
import { probeAdrPaths, runAdrSync } from "~/server/services/adrSync/engine";
import { readInstallationId } from "~/server/services/adrSync/github";
import {
  GITHUB_INSTALLATION_PROVIDER,
  GITHUB_INSTALLATION_TYPE,
} from "~/server/services/github/connectionState";

/**
 * Decision Log router (ADR projection).
 *
 * Gating (deliberate, per the feature's privacy decision):
 * - every procedure builds on `humanOnlyProcedure` — external-agent
 *   principals are denied outright (ADR-0049);
 * - reads gate at `edit` permission (minimum workspace role `member`) — ADR
 *   content is member-visible, NOT viewer-visible;
 * - config mutations gate at `manage_members` (admin);
 * - there is deliberately NO write path to ADR content anywhere here — git is
 *   the source of truth and the projection is one-way.
 */

const shortCodeSchema = z
  .string()
  .min(2)
  .max(10)
  .regex(/^[A-Z][A-Z0-9]*$/, "Short code must be uppercase letters/digits");

export const adrRouter = createTRPCRouter({
  /**
   * Non-deleted ADRs across the workspace's enrolled repos, with optional
   * repo/status/product filters and free-text search over title and body.
   * Duplicate labels (this workspace has real ones) are flagged against the
   * FULL set, not the filtered view — a label is a label, not a key.
   */
  list: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        repositoryIds: z.array(z.string()).optional(),
        statuses: z
          .array(z.enum(["PROPOSED", "ACCEPTED", "SUPERSEDED", "DEPRECATED", "UNKNOWN"]))
          .optional(),
        /** Filter to one product's repos; "workspace" = repos with no product. */
        productId: z.string().optional(),
        /**
         * With a real productId: ALSO include workspace-level (null-product)
         * ADRs — the product Decisions lens shows them with a marker.
         */
        includeWorkspaceWide: z.boolean().optional(),
        search: z.string().max(200).optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .query(async ({ ctx, input }) => {
      const configs = await ctx.db.adrSyncConfig.findMany({
        where: { workspaceId: input.workspaceId },
        select: { repositoryId: true, shortCode: true },
      });
      const shortCodeByRepo = new Map(
        configs.map((c) => [c.repositoryId, c.shortCode]),
      );
      const enrolledRepoIds = configs.map((c) => c.repositoryId);

      // Duplicate-label detection runs over the full non-deleted set so a
      // filtered view still flags collisions hidden outside it.
      const allLabels = await ctx.db.adrDocument.findMany({
        where: { repositoryId: { in: enrolledRepoIds }, deletedAt: null },
        select: { repositoryId: true, number: true },
      });
      const labelCounts = new Map<string, number>();
      for (const doc of allLabels) {
        if (doc.number === null) continue;
        const label = `${shortCodeByRepo.get(doc.repositoryId) ?? "ADR"}-${doc.number}`;
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }

      const search = input.search?.trim();
      const documents = await ctx.db.adrDocument.findMany({
        where: {
          repositoryId: {
            in: input.repositoryIds?.length
              ? enrolledRepoIds.filter((id) => input.repositoryIds!.includes(id))
              : enrolledRepoIds,
          },
          deletedAt: null,
          ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
          ...(input.productId
            ? {
                repository:
                  input.productId === "workspace"
                    ? { productId: null }
                    : input.includeWorkspaceWide
                      ? { OR: [{ productId: input.productId }, { productId: null }] }
                      : { productId: input.productId },
              }
            : {}),
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" as const } },
                  { body: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          repositoryId: true,
          path: true,
          number: true,
          slug: true,
          title: true,
          status: true,
          statusRaw: true,
          decidedAt: true,
          updatedAt: true,
          repository: {
            select: {
              id: true,
              fullName: true,
              productId: true,
              product: { select: { id: true, name: true, slug: true } },
            },
          },
          _count: { select: { ticketLinks: true } },
          // SUPERSEDES points superseder → superseded, so the edges INTO this
          // doc name what replaced it. The index shows it as "Superseded by".
          linksTo: {
            where: { type: "SUPERSEDES", from: { deletedAt: null } },
            // Deterministic pick when several decisions claim to supersede
            // this one: the earliest-recorded edge wins.
            orderBy: { createdAt: "asc" },
            select: {
              from: { select: { id: true, repositoryId: true, number: true } },
            },
          },
        },
        orderBy: [{ decidedAt: { sort: "desc", nulls: "last" } }, { path: "asc" }],
      });

      const labelOf = (repositoryId: string, number: number | null) =>
        number !== null
          ? `${shortCodeByRepo.get(repositoryId) ?? "ADR"}-${String(number).padStart(4, "0")}`
          : null;

      return documents.map(({ linksTo, ...doc }) => {
        const shortCode = shortCodeByRepo.get(doc.repositoryId) ?? null;
        const labelKey =
          doc.number !== null ? `${shortCode ?? "ADR"}-${doc.number}` : null;
        const superseder = linksTo[0]?.from;
        return {
          ...doc,
          shortCode,
          label: labelOf(doc.repositoryId, doc.number),
          isDuplicateLabel:
            labelKey !== null && (labelCounts.get(labelKey) ?? 0) > 1,
          supersededBy: superseder
            ? {
                id: superseder.id,
                label: labelOf(superseder.repositoryId, superseder.number),
              }
            : null,
        };
      });
    }),

  /** One ADR with its links, for the detail page. Read-only, like everything here. */
  get: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), adrId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.adrDocument.findFirst({
        where: {
          id: input.adrId,
          repository: { workspaceId: input.workspaceId },
        },
        include: {
          repository: {
            select: {
              id: true,
              fullName: true,
              productId: true,
              product: { select: { id: true, name: true, slug: true } },
            },
          },
          linksFrom: {
            include: {
              to: {
                select: {
                  id: true,
                  repositoryId: true,
                  number: true,
                  title: true,
                  status: true,
                  deletedAt: true,
                },
              },
            },
          },
          linksTo: {
            include: {
              from: {
                select: {
                  id: true,
                  repositoryId: true,
                  number: true,
                  title: true,
                  status: true,
                  deletedAt: true,
                },
              },
            },
          },
          ticketLinks: {
            include: {
              ticket: {
                select: {
                  id: true,
                  shortId: true,
                  number: true,
                  title: true,
                  status: true,
                  productId: true,
                },
              },
              feature: { select: { id: true, name: true, status: true } },
              createdBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
      }

      const configs = await ctx.db.adrSyncConfig.findMany({
        where: { workspaceId: input.workspaceId },
        select: { repositoryId: true, shortCode: true, lastCommitSha: true },
      });
      const shortCodeByRepo = new Map(
        configs.map((c) => [c.repositoryId, c.shortCode]),
      );
      const config = configs.find((c) => c.repositoryId === doc.repositoryId);

      const label = (repositoryId: string, number: number | null) =>
        number !== null
          ? `${shortCodeByRepo.get(repositoryId) ?? "ADR"}-${String(number).padStart(4, "0")}`
          : null;

      return {
        ...doc,
        shortCode: shortCodeByRepo.get(doc.repositoryId) ?? null,
        label: label(doc.repositoryId, doc.number),
        // Deep link pinned at the last-synced state, never HEAD: the stored
        // body matches this commit even when the file was blob-SHA-skipped.
        githubUrl: `https://github.com/${doc.repository.fullName}/blob/${config?.lastCommitSha ?? "HEAD"}/${doc.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        linksFrom: doc.linksFrom.map((link) => ({
          ...link,
          to: { ...link.to, label: label(link.to.repositoryId, link.to.number) },
        })),
        linksTo: doc.linksTo.map((link) => ({
          ...link,
          from: {
            ...link.from,
            label: label(link.from.repositoryId, link.from.number),
          },
        })),
      };
    }),

  /**
   * The decision network for the graph view: every non-deleted ADR as a node
   * (clustered by repo client-side) and every derived edge. Read-only.
   */
  graph: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        /** Filter to one product's repos; "workspace" = repos with no product. */
        productId: z.string().optional(),
        /**
         * With a real productId: ALSO include workspace-level (null-product)
         * repos — the product graph shows their decisions alongside.
         */
        includeWorkspaceWide: z.boolean().optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .query(async ({ ctx, input }) => {
      const configs = await ctx.db.adrSyncConfig.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.productId
            ? {
                repository:
                  input.productId === "workspace"
                    ? { productId: null }
                    : input.includeWorkspaceWide
                      ? { OR: [{ productId: input.productId }, { productId: null }] }
                      : { productId: input.productId },
              }
            : {}),
        },
        select: {
          repositoryId: true,
          shortCode: true,
          repository: { select: { fullName: true } },
        },
      });
      const shortCodeByRepo = new Map(
        configs.map((c) => [c.repositoryId, c.shortCode]),
      );
      const repoIds = configs.map((c) => c.repositoryId);

      const documents = await ctx.db.adrDocument.findMany({
        where: { repositoryId: { in: repoIds }, deletedAt: null },
        select: {
          id: true,
          repositoryId: true,
          number: true,
          title: true,
          status: true,
          decidedAt: true,
        },
        orderBy: [{ repositoryId: "asc" }, { number: "asc" }, { path: "asc" }],
      });
      const docIds = new Set(documents.map((d) => d.id));

      const links = await ctx.db.adrLink.findMany({
        where: { from: { repositoryId: { in: repoIds } } },
        select: { id: true, type: true, fromId: true, toId: true, evidence: true },
      });

      return {
        repos: configs.map((c) => ({
          repositoryId: c.repositoryId,
          fullName: c.repository.fullName,
          shortCode: c.shortCode,
        })),
        nodes: documents.map((doc) => ({
          ...doc,
          label:
            doc.number !== null
              ? `${shortCodeByRepo.get(doc.repositoryId) ?? "ADR"}-${String(doc.number).padStart(4, "0")}`
              : null,
        })),
        // Both endpoints must be visible nodes (a soft-deleted doc keeps its
        // edges in the DB but drops out of the picture).
        edges: links.filter((l) => docIds.has(l.fromId) && docIds.has(l.toId)),
      };
    }),

  /** The workspace's ADR sync configs (enrolment state), with repo info. */
  listConfigs: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .query(async ({ ctx, input }) => {
      return ctx.db.adrSyncConfig.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          repository: {
            select: {
              id: true,
              fullName: true,
              owner: true,
              name: true,
              productId: true,
              product: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  /**
   * Bulk enrolment: create or update sync configs for many repos in one
   * submission. Admin only. Short codes must be workspace-unique — both
   * within the submission and against existing configs of other repos.
   */
  upsertConfigs: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        configs: z
          .array(
            z.object({
              repositoryId: z.string(),
              shortCode: shortCodeSchema,
              adrPaths: z.array(z.string().min(1)).min(1).default(["docs/adr"]),
              enabled: z.boolean().default(true),
            }),
          )
          .min(1),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const codes = input.configs.map((c) => c.shortCode);
      if (new Set(codes).size !== codes.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Short codes must be unique within the submission",
        });
      }

      const repos = await ctx.db.workspaceRepository.findMany({
        where: {
          workspaceId: input.workspaceId,
          id: { in: input.configs.map((c) => c.repositoryId) },
        },
        select: { id: true },
      });
      const knownRepoIds = new Set(repos.map((r) => r.id));
      const unknown = input.configs.filter((c) => !knownRepoIds.has(c.repositoryId));
      if (unknown.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more repositories are not tracked by this workspace",
        });
      }

      // Codes taken by OTHER repos' configs collide; re-submitting a repo's
      // own code is fine.
      const existingConfigs = await ctx.db.adrSyncConfig.findMany({
        where: { workspaceId: input.workspaceId },
        select: { repositoryId: true, shortCode: true },
      });
      const takenByOther = new Set(
        existingConfigs
          .filter(
            (existing) =>
              !input.configs.some((c) => c.repositoryId === existing.repositoryId),
          )
          .map((existing) => existing.shortCode),
      );
      const collisions = codes.filter((code) => takenByOther.has(code));
      if (collisions.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Short code already in use: ${collisions.join(", ")}`,
        });
      }

      const installation = await ctx.db.integration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          provider: GITHUB_INSTALLATION_PROVIDER,
          type: GITHUB_INSTALLATION_TYPE,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!installation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GitHub App is not installed for this workspace",
        });
      }

      // One transaction so a multi-repo save never half-applies. Codes being
      // swapped WITHIN the submission (A takes B's code and vice versa) would
      // trip the unique constraint mid-loop, so existing rows in the
      // submission are first parked on placeholder codes to free theirs.
      try {
        return await ctx.db.$transaction(async (tx) => {
          const existingInSubmission = existingConfigs.filter((existing) =>
            input.configs.some((c) => c.repositoryId === existing.repositoryId),
          );
          for (const existing of existingInSubmission) {
            await tx.adrSyncConfig.update({
              where: {
                workspaceId_repositoryId: {
                  workspaceId: input.workspaceId,
                  repositoryId: existing.repositoryId,
                },
              },
              // repositoryId is unique per workspace, so this placeholder is too.
              data: { shortCode: `~swap~${existing.repositoryId}` },
            });
          }

          const results = [];
          for (const config of input.configs) {
            results.push(
              await tx.adrSyncConfig.upsert({
                where: {
                  workspaceId_repositoryId: {
                    workspaceId: input.workspaceId,
                    repositoryId: config.repositoryId,
                  },
                },
                create: {
                  workspaceId: input.workspaceId,
                  repositoryId: config.repositoryId,
                  shortCode: config.shortCode,
                  adrPaths: config.adrPaths,
                  enabled: config.enabled,
                  integrationId: installation.id,
                  createdById: ctx.session.user.id,
                },
                update: {
                  shortCode: config.shortCode,
                  adrPaths: config.adrPaths,
                  enabled: config.enabled,
                  // Re-enrolling reconnects a previously disconnected config.
                  integrationId: installation.id,
                },
              }),
            );
          }
          return results;
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A short code in this submission collides with an existing one",
          });
        }
        throw error;
      }
    }),

  /**
   * Link an implementing ticket OR feature to an ADR — the Decision Log's
   * only writable surface. User-authored data: it survives repo
   * disconnection and even soft-deletion of the document.
   */
  linkTicket: humanOnlyProcedure
    .input(
      z
        .object({
          workspaceId: z.string(),
          adrId: z.string(),
          ticketId: z.string().optional(),
          featureId: z.string().optional(),
        })
        .refine(
          (v) => (v.ticketId ? !v.featureId : !!v.featureId),
          "Provide exactly one of ticketId or featureId",
        ),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const adr = await ctx.db.adrDocument.findFirst({
        where: { id: input.adrId, repository: { workspaceId: input.workspaceId } },
        select: { id: true },
      });
      if (!adr) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
      }
      if (input.ticketId) {
        const ticket = await ctx.db.ticket.findFirst({
          where: { id: input.ticketId, product: { workspaceId: input.workspaceId } },
          select: { id: true },
        });
        if (!ticket) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
        }
      }
      if (input.featureId) {
        const feature = await ctx.db.feature.findFirst({
          where: { id: input.featureId, product: { workspaceId: input.workspaceId } },
          select: { id: true },
        });
        if (!feature) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
        }
      }
      const existing = await ctx.db.adrTicketLink.findFirst({
        where: {
          adrId: adr.id,
          ticketId: input.ticketId ?? null,
          featureId: input.featureId ?? null,
        },
      });
      if (existing) return existing;
      try {
        return await ctx.db.adrTicketLink.create({
          data: {
            adrId: adr.id,
            ticketId: input.ticketId ?? null,
            featureId: input.featureId ?? null,
            createdById: ctx.session.user.id,
          },
        });
      } catch (error) {
        // Two rapid clicks can race past the findFirst; the DB unique holds
        // the line — treat the loser as the idempotent success it is.
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          const raced = await ctx.db.adrTicketLink.findFirst({
            where: {
              adrId: adr.id,
              ticketId: input.ticketId ?? null,
              featureId: input.featureId ?? null,
            },
          });
          if (raced) return raced;
        }
        throw error;
      }
    }),

  /** Remove one implemented-by link. */
  unlinkTicket: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), linkId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.adrTicketLink.findFirst({
        where: {
          id: input.linkId,
          adr: { repository: { workspaceId: input.workspaceId } },
        },
        select: { id: true },
      });
      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
      }
      await ctx.db.adrTicketLink.delete({ where: { id: link.id } });
      return { deleted: true };
    }),

  /** Recent sync runs (the ledger), workspace-wide or for one config. */
  listRuns: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        configId: z.string().optional(),
        limit: z.number().min(1).max(100).default(30),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .query(async ({ ctx, input }) => {
      return ctx.db.adrSyncRun.findMany({
        where: {
          config: { workspaceId: input.workspaceId },
          ...(input.configId ? { configId: input.configId } : {}),
        },
        include: {
          config: {
            select: {
              id: true,
              shortCode: true,
              repository: { select: { fullName: true } },
            },
          },
          triggeredBy: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: "desc" },
        take: input.limit,
      });
    }),

  /**
   * Disable a config: soft state change only. Nulls the integration link and
   * flips `enabled` off; documents, links and run history are all retained
   * (ADR-0042 precedent).
   */
  disableConfig: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), configId: z.string() }))
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.db.adrSyncConfig.findFirst({
        where: { id: input.configId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sync config not found" });
      }
      return ctx.db.adrSyncConfig.update({
        where: { id: config.id },
        data: { enabled: false, integrationId: null },
      });
    }),

  /**
   * Assign (or clear) a repo's product. ADRs derive their product through the
   * repo; null means workspace-level (e.g. a shared architecture repo).
   */
  setRepositoryProduct: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        repositoryId: z.string(),
        productId: z.string().nullable(),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.db.workspaceRepository.findFirst({
        where: { id: input.repositoryId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!repository) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }
      if (input.productId !== null) {
        const product = await ctx.db.product.findFirst({
          where: { id: input.productId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
        }
      }
      return ctx.db.workspaceRepository.update({
        where: { id: repository.id },
        data: { productId: input.productId },
      });
    }),

  /**
   * Pre-enrolment probe: does each candidate path exist, and how many markdown
   * files does it hold? Read-only against GitHub; writes nothing.
   */
  probePaths: humanOnlyProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        repositoryId: z.string(),
        adrPaths: z.array(z.string().min(1)).min(1),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.db.workspaceRepository.findFirst({
        where: { id: input.repositoryId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!repository) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }
      const installation = await ctx.db.integration.findFirst({
        where: {
          workspaceId: input.workspaceId,
          provider: GITHUB_INSTALLATION_PROVIDER,
          type: GITHUB_INSTALLATION_TYPE,
          status: "ACTIVE",
        },
        select: { providerConfig: true },
      });
      const installationId = readInstallationId(installation?.providerConfig);
      if (!installationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GitHub App is not installed for this workspace",
        });
      }
      return probeAdrPaths(ctx.db, {
        repositoryId: repository.id,
        adrPaths: input.adrPaths,
        installationId,
      });
    }),

  /** Run one config's sync immediately. Admin only. */
  syncNow: humanOnlyProcedure
    .input(z.object({ workspaceId: z.string(), configId: z.string() }))
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const config = await ctx.db.adrSyncConfig.findFirst({
        where: { id: input.configId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sync config not found" });
      }
      return runAdrSync(ctx.db, config.id, "manual", {
        triggeredById: ctx.session.user.id,
      });
    }),
});
