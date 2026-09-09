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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "ceremony";

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

      const occurrences = await ctx.db.ceremonyOccurrence.findMany({
        where: { ceremonyId: ceremony.id },
        orderBy: { scheduledStart: "desc" },
        take: 50,
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          skipReason: true,
          agendaGeneratedAt: true,
          agendaCirculatedAt: true,
          scheduledMeetingId: true,
          recordedMeetings: { select: { id: true } },
        },
      });

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
      return { ceremony, occurrencesCreated: created };
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
        select: { id: true, workspaceId: true },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      if (!meeting.workspaceId || occurrence.workspaceId !== meeting.workspaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The occurrence must belong to the meeting's workspace",
        });
      }
      await ctx.db.transcriptionSession.update({
        where: { id: meeting.id },
        data: { occurrenceId: occurrence.id },
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
