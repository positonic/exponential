import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { CeremonyKind, type Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access";
import {
  buildTranscriptionAccessWhere,
  canEditTranscription,
  getTranscriptionAccess,
} from "~/server/services/access/resolvers/transcriptionResolver";
import { ensureOccurrences } from "~/server/services/ceremonies/occurrences";
import { buildRule } from "~/server/services/ceremonies/expandOccurrences";
import { CEREMONY_TEMPLATES } from "~/server/services/ceremonies/templates";
import { backfillWorkspaceAttachments } from "~/server/services/ceremonies/autoAttach";
import { recordOccurrenceCaptured, recordOccurrencesScheduled } from "~/server/services/ceremonies/activity";
import { generateAgenda } from "~/server/services/ceremonies/agenda/generateAgenda";
import { circulateAgenda } from "~/server/services/ceremonies/agenda/circulateAgenda";
import { addAgendaItem, reorderAgendaItems, setAgendaItemResolved } from "~/server/services/ceremonies/agenda/items";
import { readAgendaSnapshot } from "~/server/services/ceremonies/agenda/types";

/**
 * Ceremonies router (ADR-0059).
 *
 * Gating:
 * - `protectedProcedure` throughout — external-agent principals may read and
 *   (later) trigger agenda generation; only ADR-style routers are human-only.
 * - reads gate on workspace membership (`view`, any role including viewer);
 * - ceremony mutations gate at `edit` (minimum role `member`, so viewers are
 *   denied);
 * - attaching / detaching a recorded meeting gates on `canEditTranscription`
 *   for that meeting (ADR-0014), plus the occurrence must live in the
 *   meeting's workspace.
 * - recorded meetings on an occurrence are listed through
 *   `buildTranscriptionAccessWhere`; one the caller cannot view is returned
 *   as `{ id, exists: true }` only.
 */

const slugify = (value: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "ceremony";
};

/** Validates the RRULE body by building the engine; surfaces a 400 on garbage. */
function assertValidCadence(cadenceRule: string, timezone: string) {
  try {
    buildRule({ cadenceRule, timezone, startsOn: new Date(), durationMinutes: 1 });
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid cadence rule or time zone: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

const agendaSectionSchema = z.object({
  key: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  minutes: z.number().int().nonnegative().optional(),
  config: z.record(z.unknown()).optional(),
});

const ceremonyFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).optional(),
  aliases: z.array(z.string().min(1).max(120)).max(20).default([]),
  kind: z.nativeEnum(CeremonyKind).default(CeremonyKind.CUSTOM),
  purpose: z.string().max(10_000).nullish(),
  notFor: z.string().max(10_000).nullish(),
  inputs: z.string().max(10_000).nullish(),
  outputs: z.string().max(10_000).nullish(),
  cadenceRule: z.string().min(1).max(500),
  timezone: z.string().min(1).max(64),
  startsOn: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(24 * 60).default(30),
  leadTimeHours: z.number().int().min(0).max(24 * 14).default(24),
  ownerId: z.string().optional(),
  productId: z.string().nullish(),
  teamId: z.string().nullish(),
  projectId: z.string().nullish(),
  participantUserIds: z.array(z.string()).max(200).default([]),
  agendaTemplate: z.array(agendaSectionSchema).default([]),
  matrixRoomId: z.string().nullish(),
});

/**
 * One definition in an import file: the template shape plus the
 * workspace-specific bits a file can carry by name only (no ids, no secrets).
 * Every field except `slug` is optional so a partial file updates only what
 * it carries — Zod defaults must not turn a re-import into a reset. A new
 * ceremony still needs `name` and `cadenceRule` (checked at import time).
 */
const importDefinitionSchema = ceremonyFieldsSchema
  .omit({ ownerId: true, participantUserIds: true, productId: true, teamId: true, projectId: true, timezone: true, startsOn: true, slug: true })
  .partial()
  .extend({
    slug: z.string().min(1).max(60),
    timezone: z.string().min(1).max(64).optional(),
    startsOn: z.coerce.date().optional(),
    /**
     * Resolved against workspace members by exact name or email. Unresolved
     * or absent: a new ceremony is owned by the importer; an existing one
     * keeps its owner.
     */
    ownerName: z.string().optional(),
    /** Replaces the participant set when present; absent leaves it untouched. */
    participantNames: z.array(z.string()).optional(),
  });

const ceremonySummarySelect = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  aliases: true,
  kind: true,
  cadenceRule: true,
  timezone: true,
  startsOn: true,
  durationMinutes: true,
  leadTimeHours: true,
  isActive: true,
  ownerId: true,
  productId: true,
  teamId: true,
  projectId: true,
  owner: { select: { id: true, name: true, email: true, image: true } },
  _count: { select: { occurrences: true, participants: true } },
} satisfies Prisma.CeremonySelect;

export const ceremonyRouter = createTRPCRouter({
  /** Built-in templates for the six ceremony kinds ("Add from template"). */
  templates: protectedProcedure.query(() => CEREMONY_TEMPLATES),

  /** Ceremonies of a workspace (active by default). */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        includeInactive: z.boolean().optional(),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.ceremony.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.includeInactive ? {} : { isActive: true }),
        },
        select: ceremonySummarySelect,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });
    }),

  /** One ceremony with participants and its recent + upcoming occurrences. */
  get: protectedProcedure
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ceremony = await ctx.db.ceremony.findFirst({
        where: { id: input.id, workspaceId: input.workspaceId },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
          product: { select: { id: true, name: true, slug: true } },
          team: { select: { id: true, name: true, slug: true } },
          project: { select: { id: true, name: true, slug: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      });
      if (!ceremony) throw new TRPCError({ code: "NOT_FOUND", message: "Ceremony not found" });

      // A bounded set on each side of now, so a frequent ceremony's pre-created
      // future rows can never crowd out the past ones that carry recordings.
      const now = new Date();
      const occurrenceSelect = {
        id: true,
        scheduledStart: true,
        scheduledEnd: true,
        status: true,
        skipReason: true,
        agendaGeneratedAt: true,
        agendaCirculatedAt: true,
        scheduledMeetingId: true,
        recordedMeetings: { select: { id: true } },
      } satisfies Prisma.CeremonyOccurrenceSelect;
      const [upcoming, past] = await Promise.all([
        ctx.db.ceremonyOccurrence.findMany({
          where: { ceremonyId: ceremony.id, scheduledStart: { gte: now } },
          orderBy: { scheduledStart: "asc" },
          take: 30,
          select: occurrenceSelect,
        }),
        ctx.db.ceremonyOccurrence.findMany({
          where: { ceremonyId: ceremony.id, scheduledStart: { lt: now } },
          orderBy: { scheduledStart: "desc" },
          take: 50,
          select: occurrenceSelect,
        }),
      ]);
      // Newest first overall: upcoming (furthest first) then past (most recent first).
      const occurrences = [...upcoming.reverse(), ...past];

      // Meeting visibility (ADR-0014): resolve which linked recordings the
      // caller may see; the rest are returned as existence-only stubs.
      const meetingIds = occurrences.flatMap((o) => o.recordedMeetings.map((m) => m.id));
      const visible = meetingIds.length
        ? await ctx.db.transcriptionSession.findMany({
            where: { id: { in: meetingIds }, ...buildTranscriptionAccessWhere(userId) },
            select: { id: true, title: true, meetingDate: true, processedAt: true },
          })
        : [];
      const visibleById = new Map(visible.map((m) => [m.id, m]));

      return {
        ...ceremony,
        occurrences: occurrences.map((o) => ({
          ...o,
          recordedMeetings: o.recordedMeetings.map((m) => {
            const v = visibleById.get(m.id);
            return v
              ? { id: v.id, exists: true as const, title: v.title, meetingDate: v.meetingDate, processedAt: v.processedAt }
              : { id: m.id, exists: true as const, title: null, meetingDate: null, processedAt: null };
          }),
        })),
      };
    }),

  /**
   * Occurrences of a workspace inside a date window — the picker behind the
   * meeting page's "Part of" row. Ordered by start ascending.
   */
  listOccurrences: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        from: z.coerce.date(),
        to: z.coerce.date(),
        ceremonyId: z.string().optional(),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.ceremonyOccurrence.findMany({
        where: {
          workspaceId: input.workspaceId,
          scheduledStart: { gte: input.from, lte: input.to },
          ...(input.ceremonyId ? { ceremonyId: input.ceremonyId } : {}),
        },
        orderBy: { scheduledStart: "asc" },
        take: 200,
        select: {
          id: true,
          ceremonyId: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          ceremony: { select: { id: true, name: true, kind: true } },
        },
      });
    }),

  /** One occurrence with its agenda snapshot, ceremony summary and visible recordings. */
  getOccurrence: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        include: {
          ceremony: {
            select: {
              id: true,
              name: true,
              kind: true,
              timezone: true,
              durationMinutes: true,
              leadTimeHours: true,
              ownerId: true,
              agendaTemplate: true,
              owner: { select: { id: true, name: true, email: true } },
            },
          },
          recordedMeetings: { select: { id: true } },
        },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      const meetingIds = occurrence.recordedMeetings.map((m) => m.id);
      const visible = meetingIds.length
        ? await ctx.db.transcriptionSession.findMany({
            where: { id: { in: meetingIds }, ...buildTranscriptionAccessWhere(userId) },
            select: { id: true, title: true, meetingDate: true },
          })
        : [];
      const visibleById = new Map(visible.map((m) => [m.id, m]));
      const membership = await ctx.db.workspaceUser.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: input.workspaceId } },
        select: { role: true },
      });
      const canGenerate =
        occurrence.ceremony.ownerId === userId || membership?.role === "owner" || membership?.role === "admin";
      return {
        ...occurrence,
        agenda: readAgendaSnapshot(occurrence.agenda),
        canGenerate,
        recordedMeetings: occurrence.recordedMeetings.map((m) => {
          const v = visibleById.get(m.id);
          return v
            ? { id: v.id, exists: true as const, title: v.title, meetingDate: v.meetingDate }
            : { id: m.id, exists: true as const, title: null, meetingDate: null };
        }),
      };
    }),

  /**
   * Generate or regenerate an occurrence's agenda on demand. The ceremony
   * owner (or a workspace owner/admin) only; runs inside the request.
   */
  generateAgenda: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        occurrenceId: z.string(),
        /** Also send "agenda ready" to participants (again, if already sent). */
        circulate: z.boolean().optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: { id: true, ceremony: { select: { ownerId: true } } },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      if (occurrence.ceremony.ownerId !== userId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: { userId_workspaceId: { userId, workspaceId: input.workspaceId } },
          select: { role: true },
        });
        if (membership?.role !== "owner" && membership?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the ceremony owner can generate its agenda" });
        }
      }
      const generated = await generateAgenda(ctx.db, occurrence.id);
      let circulated = false;
      if (input.circulate) {
        ({ circulated } = await circulateAgenda(ctx.db, occurrence.id, { actorUserId: userId, force: true }));
      }
      return { ...generated, circulated };
    }),

  /** Mark one agenda item resolved (or reopen it). Any non-viewer member; survives regeneration. */
  resolveAgendaItem: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string(), itemId: z.string(), resolved: z.boolean() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      const agenda = await setAgendaItemResolved(ctx.db, occurrence.id, input.itemId, input.resolved);
      return { occurrenceId: occurrence.id, agenda };
    }),

  /** Add an item by hand to a section; kept across regeneration. */
  addAgendaItem: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string(), sectionKey: z.string(), title: z.string().trim().min(1).max(300), detail: z.string().max(500).nullish() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      const agenda = await addAgendaItem(ctx.db, occurrence.id, { sectionKey: input.sectionKey, title: input.title, detail: input.detail, userId: ctx.session.user.id });
      return { occurrenceId: occurrence.id, agenda };
    }),

  /** Reorder a section's items; the order is kept across regeneration. */
  reorderAgendaItems: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string(), sectionKey: z.string(), itemIds: z.array(z.string()).max(200) }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      const agenda = await reorderAgendaItems(ctx.db, occurrence.id, { sectionKey: input.sectionKey, itemIds: input.itemIds });
      return { occurrenceId: occurrence.id, agenda };
    }),

  /** Create a ceremony and its first occurrence(s) for the rolling window. */
  create: protectedProcedure
    .input(ceremonyFieldsSchema.extend({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      assertValidCadence(input.cadenceRule, input.timezone);
      const slug = input.slug ? slugify(input.slug) : slugify(input.name);

      const existing = await ctx.db.ceremony.findUnique({
        where: { workspaceId_slug: { workspaceId: input.workspaceId, slug } },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `A ceremony with slug "${slug}" already exists` });
      }

      const { participantUserIds, workspaceId, agendaTemplate, ...fields } = input;
      const ceremony = await ctx.db.ceremony.create({
        data: {
          ...fields,
          slug,
          workspaceId,
          ownerId: input.ownerId ?? userId,
          createdById: userId,
          agendaTemplate: agendaTemplate as Prisma.InputJsonValue,
          participants: {
            create: Array.from(new Set(participantUserIds)).map((id) => ({ userId: id })),
          },
        },
      });

      const created = await ensureOccurrences(ctx.db, ceremony);
      await recordOccurrencesScheduled(ctx.db, ceremony, created, userId);
      return { ceremony, occurrencesCreated: created };
    }),

  /**
   * Edit a definition. Existing occurrences keep their snapshot; when the
   * cadence changes, future PLANNED occurrences that nothing has attached to
   * yet are dropped and regenerated so the schedule follows the new rule.
   */
  update: protectedProcedure
    .input(
      ceremonyFieldsSchema
        .partial()
        .extend({ workspaceId: z.string(), id: z.string(), isActive: z.boolean().optional() }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, id, participantUserIds, agendaTemplate, slug: rawSlug, ...fields } = input;
      const existing = await ctx.db.ceremony.findFirst({ where: { id, workspaceId } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ceremony not found" });

      const cadenceRule = fields.cadenceRule ?? existing.cadenceRule;
      const timezone = fields.timezone ?? existing.timezone;
      assertValidCadence(cadenceRule, timezone);

      const slug = rawSlug ? slugify(rawSlug) : undefined;
      if (slug && slug !== existing.slug) {
        const clash = await ctx.db.ceremony.findUnique({
          where: { workspaceId_slug: { workspaceId, slug } },
          select: { id: true },
        });
        if (clash) throw new TRPCError({ code: "CONFLICT", message: `A ceremony with slug "${slug}" already exists` });
      }

      const cadenceChanged =
        cadenceRule !== existing.cadenceRule ||
        timezone !== existing.timezone ||
        (fields.startsOn !== undefined && fields.startsOn.getTime() !== existing.startsOn.getTime()) ||
        (fields.durationMinutes !== undefined && fields.durationMinutes !== existing.durationMinutes);

      const ceremony = await ctx.db.$transaction(async (tx) => {
        const updated = await tx.ceremony.update({
          where: { id },
          data: {
            ...fields,
            ...(slug ? { slug } : {}),
            ...(agendaTemplate ? { agendaTemplate: agendaTemplate as Prisma.InputJsonValue } : {}),
            ...(participantUserIds
              ? {
                  participants: {
                    deleteMany: {},
                    create: Array.from(new Set(participantUserIds)).map((userId) => ({ userId })),
                  },
                }
              : {}),
          },
        });
        if (cadenceChanged) {
          await tx.ceremonyOccurrence.deleteMany({
            where: {
              ceremonyId: id,
              status: "PLANNED",
              scheduledStart: { gt: new Date() },
              scheduledMeetingId: null,
              recordedMeetings: { none: {} },
            },
          });
        }
        return updated;
      });

      let occurrencesCreated = 0;
      if (ceremony.isActive && (cadenceChanged || input.isActive === true)) {
        occurrencesCreated = await ensureOccurrences(ctx.db, ceremony);
        await recordOccurrencesScheduled(ctx.db, ceremony, occurrencesCreated, ctx.session.user.id);
      }
      return { ceremony, occurrencesCreated };
    }),

  /**
   * Upsert ceremony definitions from a JSON array (the template shape, keyed
   * by slug). Owner / participants are resolved by member name or email;
   * unresolved names fall back to the importer and are reported. Owner or
   * admin only — the same gate the ADR router uses for config mutations.
   */
  importDefinitions: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        definitions: z.array(importDefinitionSchema).min(1).max(50),
        /** Default zone for definitions that carry none. */
        timezone: z.string().min(1).max(64).optional(),
        /** Default anchor for definitions that carry none. */
        startsOn: z.coerce.date().optional(),
      }),
    )
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const members = await ctx.db.workspaceUser.findMany({
        where: { workspaceId: input.workspaceId },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      const byKey = new Map<string, string>();
      for (const m of members) {
        if (m.user.name) byKey.set(m.user.name.trim().toLowerCase(), m.user.id);
        if (m.user.email) byKey.set(m.user.email.trim().toLowerCase(), m.user.id);
      }
      const resolve = (name: string | undefined) => (name ? byKey.get(name.trim().toLowerCase()) ?? null : null);

      const results: Array<{ slug: string; action: "created" | "updated"; occurrencesCreated: number; unresolved: string[] }> = [];
      for (const def of input.definitions) {
        const slug = slugify(def.slug);
        const existing = await ctx.db.ceremony.findUnique({
          where: { workspaceId_slug: { workspaceId: input.workspaceId, slug } },
        });
        const timezone = def.timezone ?? existing?.timezone ?? input.timezone;
        const startsOn = def.startsOn ?? existing?.startsOn ?? input.startsOn;
        if (!timezone || !startsOn) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${def.slug}" needs a timezone and a startsOn (in the definition or as import defaults)` });
        }
        if (!existing && (!def.name || !def.cadenceRule)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `"${def.slug}" is new and needs at least a name and a cadenceRule` });
        }
        const cadenceRule = def.cadenceRule ?? existing?.cadenceRule;
        if (cadenceRule) assertValidCadence(cadenceRule, timezone);
        const unresolved: string[] = [];
        const ownerId = resolve(def.ownerName);
        if (def.ownerName && !ownerId) unresolved.push(def.ownerName);
        const participantIds = def.participantNames ? new Set<string>() : null;
        for (const name of def.participantNames ?? []) {
          const id = resolve(name);
          if (id) participantIds!.add(id);
          else unresolved.push(name);
        }
        const { ownerName: _o, participantNames: _p, slug: _s, timezone: _t, startsOn: _d, agendaTemplate, ...fields } = def;
        // Only the keys the file carries reach the update; a re-import never
        // resets aliases, kind, agenda, duration, lead time, owner or
        // participants it did not mention.
        const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        const ceremony = existing
          ? await ctx.db.ceremony.update({
              where: { id: existing.id },
              data: {
                ...present,
                timezone,
                startsOn,
                ...(agendaTemplate ? { agendaTemplate: agendaTemplate as Prisma.InputJsonValue } : {}),
                ...(ownerId ? { ownerId } : {}),
                ...(participantIds
                  ? { participants: { deleteMany: {}, create: Array.from(participantIds).map((id) => ({ userId: id })) } }
                  : {}),
              },
            })
          : await ctx.db.ceremony.create({
              data: {
                ...present,
                name: def.name!,
                cadenceRule: def.cadenceRule!,
                slug,
                timezone,
                startsOn,
                workspaceId: input.workspaceId,
                ownerId: ownerId ?? userId,
                createdById: userId,
                agendaTemplate: (agendaTemplate ?? []) as Prisma.InputJsonValue,
                participants: { create: Array.from(participantIds ?? []).map((id) => ({ userId: id })) },
              },
            });
        const occurrencesCreated = await ensureOccurrences(ctx.db, ceremony);
        await recordOccurrencesScheduled(ctx.db, ceremony, occurrencesCreated, userId);
        results.push({ slug, action: existing ? "updated" : "created", occurrencesCreated, unresolved });
      }
      return results;
    }),

  /**
   * Attach the workspace's unattached recordings to occurrences by alias.
   * Always run with `dryRun: true` first: the report is the review step.
   * Owner or admin only. Active ceremonies are expanded from their anchor
   * date first so historical occurrences exist to attach to.
   */
  backfillAttachments: protectedProcedure
    .input(z.object({ workspaceId: z.string(), dryRun: z.boolean().default(true) }))
    .use(requireWorkspaceMembership("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const ceremonies = await ctx.db.ceremony.findMany({ where: { workspaceId: input.workspaceId, isActive: true } });
      let occurrencesCreated = 0;
      for (const ceremony of ceremonies) {
        const inserted = await ensureOccurrences(ctx.db, ceremony);
        occurrencesCreated += inserted;
        await recordOccurrencesScheduled(ctx.db, ceremony, inserted, ctx.session.user.id);
      }
      const rows = await backfillWorkspaceAttachments(ctx.db, input.workspaceId, {
        dryRun: input.dryRun,
        actorUserId: ctx.session.user.id,
      });
      return {
        dryRun: input.dryRun,
        occurrencesCreated,
        scanned: rows.length,
        matched: rows.filter((r) => r.occurrenceId).length,
        rows,
      };
    }),

  /** Link a recorded meeting to the occurrence it captured (or unlink with null). */
  attachMeeting: protectedProcedure
    .input(z.object({ meetingId: z.string(), occurrenceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const meeting = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.meetingId },
        select: { id: true, userId: true, projectId: true, workspaceId: true },
      });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      const access = await getTranscriptionAccess(ctx.db, userId, meeting);
      if (!canEditTranscription(access)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot edit this meeting" });
      }
      const occurrence = await ctx.db.ceremonyOccurrence.findUnique({
        where: { id: input.occurrenceId },
        select: {
          id: true,
          workspaceId: true,
          scheduledStart: true,
          ceremony: { select: { name: true, timezone: true } },
        },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      if (!meeting.workspaceId || occurrence.workspaceId !== meeting.workspaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The occurrence must belong to the meeting's workspace",
        });
      }
      const updated = await ctx.db.transcriptionSession.update({
        where: { id: meeting.id },
        data: { occurrenceId: occurrence.id },
        select: { title: true },
      });
      await recordOccurrenceCaptured(ctx.db, {
        workspaceId: occurrence.workspaceId,
        occurrenceId: occurrence.id,
        ceremonyName: occurrence.ceremony.name,
        scheduledStart: occurrence.scheduledStart,
        timezone: occurrence.ceremony.timezone,
        meetingId: meeting.id,
        meetingTitle: updated.title,
        actorUserId: userId,
        via: "manual",
      });
      return { meetingId: meeting.id, occurrenceId: occurrence.id };
    }),

  detachMeeting: protectedProcedure
    .input(z.object({ meetingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const meeting = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.meetingId },
        select: { id: true, userId: true, projectId: true, workspaceId: true },
      });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      const access = await getTranscriptionAccess(ctx.db, userId, meeting);
      if (!canEditTranscription(access)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot edit this meeting" });
      }
      await ctx.db.transcriptionSession.update({
        where: { id: meeting.id },
        data: { occurrenceId: null },
      });
      return { meetingId: meeting.id, occurrenceId: null };
    }),
});
