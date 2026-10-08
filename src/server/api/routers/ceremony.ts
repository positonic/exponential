import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { CeremonyKind, type Prisma, type PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireProjectAccess, requireWorkspaceMembership } from "~/server/services/access";
import {
  buildTranscriptionAccessWhere,
  canEditTranscription,
  getTranscriptionAccess,
} from "~/server/services/access/resolvers/transcriptionResolver";
import { ensureOccurrences } from "~/server/services/ceremonies/occurrences";
import { buildRule } from "~/server/services/ceremonies/expandOccurrences";
import { CEREMONY_TEMPLATES } from "~/server/services/ceremonies/templates";
import { CEREMONY_ICON_KEYS } from "~/lib/ceremonies/icons";
import { backfillWorkspaceAttachments } from "~/server/services/ceremonies/autoAttach";
import { recordOccurrenceCaptured, recordOccurrencesScheduled } from "~/server/services/ceremonies/activity";
import { generateAgenda } from "~/server/services/ceremonies/agenda/generateAgenda";
import { circulateAgenda } from "~/server/services/ceremonies/agenda/circulateAgenda";
import { addAgendaItem, reorderAgendaItems, setAgendaItemResolved } from "~/server/services/ceremonies/agenda/items";
import { postAgendaToMatrix } from "~/server/services/ceremonies/agenda/postAgendaToMatrix";
import { canManageCeremony } from "~/server/services/ceremonies/access";
import {
  draftMyUpdate,
  getMyUpdate,
  loadUpdateScope,
  saveMyUpdate,
} from "~/server/services/ceremonies/updates/occurrenceUpdates";
import { getOccurrenceSummary } from "~/server/services/ceremonies/updates/summary";
import { evaluateSkipProposal, skipOccurrence, unskipOccurrence } from "~/server/services/ceremonies/skip";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { cancelScheduledMeeting } from "~/server/services/calendar/cancelScheduledMeeting";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { readAgendaSnapshot } from "~/server/services/ceremonies/agenda/types";
import { previewOneOffAgenda } from "~/server/services/ceremonies/agenda/previewOneOff";
import { ONE_OFF_SECTION_TYPES } from "~/server/services/ceremonies/oneOffPresets";

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

/**
 * The distinct project ids, once checked to be projects of `workspaceId`: a
 * ceremony is workspace-owned, so it cannot review another workspace's
 * project (mirrors `syncProjectCeremonies` on the project side).
 */
async function assertProjectsInWorkspace(db: PrismaClient, workspaceId: string, projectIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(projectIds));
  if (ids.length === 0) return ids;
  const inWorkspace = await db.project.count({ where: { id: { in: ids }, workspaceId } });
  if (inWorkspace !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "One or more projects are not in this workspace." });
  }
  return ids;
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
  /** Null resets to the kind's default icon. */
  icon: z.enum(CEREMONY_ICON_KEYS).nullish(),
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
  /** The projects this ceremony reviews (same workspace); replaces the set on update. */
  projectIds: z.array(z.string()).max(100).default([]),
  participantUserIds: z.array(z.string()).max(200).default([]),
  agendaTemplate: z.array(agendaSectionSchema).default([]),
  /** Append the linked-projects section to every generated agenda (see `autoSections`). */
  includeProjects: z.boolean().default(true),
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
  .omit({ ownerId: true, participantUserIds: true, productId: true, teamId: true, projectIds: true, timezone: true, startsOn: true, slug: true })
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
  icon: true,
  cadenceRule: true,
  timezone: true,
  startsOn: true,
  durationMinutes: true,
  leadTimeHours: true,
  isActive: true,
  ownerId: true,
  productId: true,
  teamId: true,
  includeProjects: true,
  projects: { select: { projectId: true } },
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
          // One-offs are meetings booked from a project, not part of the
          // operating rhythm (ADR-0059 amendment, 2026-10-07).
          isOneOff: false,
          ...(input.includeInactive ? {} : { isActive: true }),
        },
        select: ceremonySummarySelect,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });
    }),

  /**
   * Active ceremonies linked to a project, each with its next planned
   * occurrence — the project overview's "Ceremonies" section. Gated on project
   * access rather than workspace membership so a project-only member sees it.
   */
  listForProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.ceremony.findMany({
        where: { projects: { some: { projectId: input.projectId } }, isActive: true, isOneOff: false },
        select: {
          ...ceremonySummarySelect,
          occurrences: {
            where: { scheduledStart: { gte: new Date() }, status: { not: "SKIPPED" } },
            orderBy: { scheduledStart: "asc" },
            take: 1,
            select: { id: true, scheduledStart: true, status: true },
          },
        },
        orderBy: { name: "asc" },
      });
    }),

  /**
   * Dry run of a one-off meeting's agenda for the schedule-meeting modal:
   * per ticked section, how many items it would hold and the first three.
   * Never writes and never calls an LLM. Gated on project access, like the
   * project's own pages.
   */
  previewOneOffAgenda: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string(),
        scheduledStart: z.coerce.date(),
        durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
        sectionTypes: z.array(z.enum(ONE_OFF_SECTION_TYPES)).max(ONE_OFF_SECTION_TYPES.length),
        purposePreset: z.string().max(40).optional(),
        purpose: z.string().max(2000).optional(),
        /** Member attendees picked so far; their blockers count, as they will at booking. */
        attendeeUserIds: z.array(z.string()).max(50).optional(),
      }),
    )
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, workspaceId: input.workspaceId },
        select: { workspace: { select: { slug: true } } },
      });
      if (!project?.workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found in this workspace" });
      const user = await ctx.db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      // Only real members of this workspace (directly or through a team) —
      // anyone else is dropped rather than previewed.
      const requested = Array.from(new Set(input.attendeeUserIds ?? []));
      const [direct, viaTeam] = requested.length
        ? await Promise.all([
            ctx.db.workspaceUser.findMany({ where: { workspaceId: input.workspaceId, userId: { in: requested } }, select: { userId: true } }),
            ctx.db.teamUser.findMany({ where: { team: { workspaceId: input.workspaceId }, userId: { in: requested } }, select: { userId: true } }),
          ])
        : [[], []];
      const memberIds = new Set([...direct, ...viaTeam].map((m) => m.userId));
      return previewOneOffAgenda(ctx.db, {
        workspaceId: input.workspaceId,
        workspaceSlug: project.workspace.slug,
        projectId: input.projectId,
        callerUserId: userId,
        attendeeUserIds: requested.filter((id) => memberIds.has(id)),
        scheduledStart: input.scheduledStart,
        durationMinutes: input.durationMinutes,
        sectionTypes: input.sectionTypes,
        presetKey: input.purposePreset,
        purpose: input.purpose,
        timezone: user?.timezone ?? undefined,
      });
    }),

  /**
   * A project's Meetings tab timeline: occurrences of the ceremonies that
   * review the project (one-offs included), from two weeks back to one week
   * ahead. Occurrences a recording already captured are left out — that
   * recording is the row. Skipped ones stay (shown as cancelled), and a
   * recurring ceremony contributes at most `perCeremony` rows so a daily
   * standup can't bury everything else. Newest first.
   */
  listOccurrencesForProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        perCeremony: z.number().int().min(1).max(20).default(5),
      }),
    )
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      const now = Date.now();
      const from = input.from ?? new Date(now - 14 * 86_400_000);
      const to = input.to ?? new Date(now + 7 * 86_400_000);
      const rows = await ctx.db.ceremonyOccurrence.findMany({
        where: {
          ceremony: { projects: { some: { projectId: input.projectId } } },
          scheduledStart: { gte: from, lte: to },
          recordedMeetings: { none: {} },
        },
        orderBy: { scheduledStart: "desc" },
        take: 200,
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          ceremony: {
            select: {
              id: true,
              name: true,
              isOneOff: true,
              purpose: true,
              workspace: { select: { slug: true } },
              _count: { select: { participants: true } },
            },
          },
          scheduledMeeting: { select: { status: true, _count: { select: { attendees: true } } } },
        },
      });

      const perCeremony = new Map<string, number>();
      return rows
        .filter((row) => {
          if (row.ceremony.isOneOff) return true;
          const seen = perCeremony.get(row.ceremony.id) ?? 0;
          perCeremony.set(row.ceremony.id, seen + 1);
          return seen < input.perCeremony;
        })
        .map((row) => ({
          occurrenceId: row.id,
          ceremonyId: row.ceremony.id,
          ceremonyName: row.ceremony.name,
          isOneOff: row.ceremony.isOneOff,
          // Only a one-off's purpose is about this meeting; a ceremony's is its standing remit.
          purpose: row.ceremony.isOneOff ? row.ceremony.purpose : null,
          scheduledStart: row.scheduledStart,
          scheduledEnd: row.scheduledEnd,
          status: row.status,
          attendeeCount: row.scheduledMeeting?._count.attendees ?? row.ceremony._count.participants,
          href: `/w/${row.ceremony.workspace.slug}/ceremonies/${row.ceremony.id}/${row.id}`,
        }));
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
          projects: { select: { projectId: true, project: { select: { id: true, name: true, slug: true } } } },
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
              ? { id: v.id, visible: true as const, title: v.title, meetingDate: v.meetingDate, processedAt: v.processedAt }
              : { id: m.id, visible: false as const, title: null, meetingDate: null, processedAt: null };
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
              matrixRoomId: true,
              agendaTemplate: true,
              isOneOff: true,
              purpose: true,
              owner: { select: { id: true, name: true, email: true } },
            },
          },
          recordedMeetings: { select: { id: true } },
          // The booking, so a one-off's page can offer Cancel.
          scheduledMeeting: {
            select: {
              id: true,
              status: true,
              organizerId: true,
              attendees: { select: { name: true, userId: true } },
            },
          },
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
      const canGenerate = await canManageCeremony(ctx.db, userId, input.workspaceId, occurrence.ceremony.ownerId);
      const skipProposal = await evaluateSkipProposal(ctx.db, occurrence.id);
      const { scheduledMeeting } = occurrence;
      return {
        ...occurrence,
        isOneOff: occurrence.ceremony.isOneOff,
        purpose: occurrence.ceremony.purpose,
        // Attendee names only — external attendees' addresses stay off the page.
        scheduledMeeting: scheduledMeeting
          ? {
              id: scheduledMeeting.id,
              status: scheduledMeeting.status,
              organizerId: scheduledMeeting.organizerId,
              attendees: scheduledMeeting.attendees.map((a) => ({ userId: a.userId, name: a.name })),
            }
          : null,
        agenda: readAgendaSnapshot(occurrence.agenda),
        canGenerate,
        skipProposal,
        recordedMeetings: occurrence.recordedMeetings.map((m) => {
          const v = visibleById.get(m.id);
          return v
            ? { id: v.id, visible: true as const, title: v.title, meetingDate: v.meetingDate }
            : { id: m.id, visible: false as const, title: null, meetingDate: null };
        }),
      };
    }),

  /**
   * The caller's own async-first update for an occurrence (ADR-0059, V3):
   * the ceremony kind's questions, their drafted and written answers. Read
   * with `view` — a viewer sees the questions and their own empty row, and
   * the write procedures below gate at `edit`.
   */
  myOccurrenceUpdate: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const scope = await loadUpdateScope(ctx.db, input.occurrenceId, input.workspaceId);
      const update = await getMyUpdate(ctx.db, scope, ctx.session.user.id);
      return { ...update, isParticipant: scope.participantUserIds.includes(ctx.session.user.id) };
    }),

  /**
   * The merged async summary: every participant's submitted update, plus the
   * people who haven't answered. Any workspace member who can see the
   * occurrence can read it — it is the meeting, held in writing.
   */
  occurrenceUpdateSummary: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const scope = await loadUpdateScope(ctx.db, input.occurrenceId, input.workspaceId);
      return getOccurrenceSummary(ctx.db, scope);
    }),

  /** Draft the caller's answers from their own activity since the previous occurrence. */
  draftMyOccurrenceUpdate: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const scope = await loadUpdateScope(ctx.db, input.occurrenceId, input.workspaceId);
      return draftMyUpdate(ctx.db, scope, ctx.session.user.id);
    }),

  /** Save (and optionally submit, or reopen) the caller's own answers. */
  saveMyOccurrenceUpdate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        occurrenceId: z.string(),
        answers: z.record(z.string().max(10_000)),
        flaggedBlocker: z.boolean().optional(),
        submit: z.boolean().optional(),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const scope = await loadUpdateScope(ctx.db, input.occurrenceId, input.workspaceId);
      return saveMyUpdate(ctx.db, scope, ctx.session.user.id, {
        answers: input.answers,
        flaggedBlocker: input.flaggedBlocker,
        submit: input.submit,
      });
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
      if (!(await canManageCeremony(ctx.db, userId, input.workspaceId, occurrence.ceremony.ownerId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the ceremony owner can generate its agenda" });
      }
      const generated = await generateAgenda(ctx.db, occurrence.id);
      let circulated = false;
      if (input.circulate) {
        ({ circulated } = await circulateAgenda(ctx.db, occurrence.id, { actorUserId: userId, force: true }));
      }
      return { ...generated, circulated };
    }),

  /**
   * Skip an occurrence, with a reason (ADR-0059, V3). The ceremony owner (or
   * a workspace owner/admin) only, and never automatic: an empty agenda is an
   * offer to skip, not a decision. Participants are told, and the deep link
   * lands on the async summary that stands in for the meeting.
   */
  skipOccurrence: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        occurrenceId: z.string(),
        reason: z.string().trim().min(1).max(500),
      }),
    )
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: {
          id: true,
          status: true,
          ceremony: { select: { ownerId: true, isOneOff: true } },
          scheduledMeeting: { select: { id: true, status: true } },
        },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      if (!(await canManageCeremony(ctx.db, userId, input.workspaceId, occurrence.ceremony.ownerId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the ceremony owner can skip an occurrence" });
      }
      // A one-off is its booking: skipping it cancels the Scheduled meeting
      // (METHOD:CANCEL to every attendee) so no calendar keeps a phantom. The
      // cancel service writes the skip in the same transaction as the
      // cancellation, and the attendees' cancel email is the notice — no skip
      // notice follows.
      if (occurrence.ceremony.isOneOff && occurrence.scheduledMeeting?.status === "confirmed") {
        if (occurrence.status === "CAPTURED" || occurrence.status === "FOLLOWED_THROUGH") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence already happened" });
        }
        if (occurrence.status === "SKIPPED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence is already skipped" });
        }
        await cancelScheduledMeeting(ctx.db, {
          workspaceId: input.workspaceId,
          meetingId: occurrence.scheduledMeeting.id,
          actorUserId: userId,
          skipReason: input.reason,
        });
        return { id: occurrence.id, status: "SKIPPED" as const, skipReason: input.reason };
      }
      const skipped = await skipOccurrence(ctx.db, {
        occurrenceId: occurrence.id,
        workspaceId: input.workspaceId,
        reason: input.reason,
        actorUserId: userId,
      });
      // Telling people it is off is the whole point of skipping it; a failed
      // notification must not leave the occurrence half-skipped.
      await emitNotification({
        db: ctx.db,
        category: NOTIFICATION_CATEGORIES.AGENDA_READY,
        actorUserId: userId,
        subject: { occurrenceId: occurrence.id },
      }).catch((err) => {
        console.error("[ceremonies] skip notification failed:", err);
      });
      return skipped;
    }),

  /** Undo a skip; the occurrence goes back to where it was in the agenda flow. */
  unskipOccurrence: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: {
          id: true,
          ceremony: { select: { ownerId: true, isOneOff: true } },
          scheduledMeeting: { select: { status: true } },
        },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      if (!(await canManageCeremony(ctx.db, userId, input.workspaceId, occurrence.ceremony.ownerId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the ceremony owner can unskip an occurrence" });
      }
      // Its invites are already withdrawn; a cancelled one-off is rebooked, not revived.
      if (occurrence.ceremony.isOneOff && occurrence.scheduledMeeting?.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This meeting was cancelled — schedule it again instead" });
      }
      return unskipOccurrence(ctx.db, { occurrenceId: occurrence.id, workspaceId: input.workspaceId, actorUserId: userId });
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

  /** Post the agenda to the ceremony's Matrix room by hand (owner, or workspace owner/admin). */
  postAgendaToMatrix: protectedProcedure
    .input(z.object({ workspaceId: z.string(), occurrenceId: z.string(), confirmRepost: z.boolean().optional() }))
    .use(requireWorkspaceMembership("edit"))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const occurrence = await ctx.db.ceremonyOccurrence.findFirst({
        where: { id: input.occurrenceId, workspaceId: input.workspaceId },
        select: { id: true, ceremony: { select: { ownerId: true } } },
      });
      if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
      if (!(await canManageCeremony(ctx.db, userId, input.workspaceId, occurrence.ceremony.ownerId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the ceremony owner can post its agenda" });
      }
      return postAgendaToMatrix(ctx.db, { occurrenceId: occurrence.id, actorUserId: userId, confirmRepost: input.confirmRepost });
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

      const { participantUserIds, workspaceId, agendaTemplate, projectIds, ...fields } = input;
      const projects = await assertProjectsInWorkspace(ctx.db, workspaceId, projectIds);
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
          projects: { create: projects.map((projectId) => ({ projectId })) },
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
      const { workspaceId, id, participantUserIds, agendaTemplate, projectIds, slug: rawSlug, ...fields } = input;
      const existing = await ctx.db.ceremony.findFirst({ where: { id, workspaceId } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ceremony not found" });
      // A one-off is one booked meeting; giving it a cadence would start
      // generating occurrences nobody booked.
      if (existing.isOneOff && fields.cadenceRule !== undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A one-off meeting can't be given a cadence" });
      }
      const projects = projectIds ? await assertProjectsInWorkspace(ctx.db, workspaceId, projectIds) : null;

      const cadenceRule = fields.cadenceRule ?? existing.cadenceRule;
      const timezone = fields.timezone ?? existing.timezone;
      if (cadenceRule) assertValidCadence(cadenceRule, timezone);

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
            // Replace the project set when provided (absent = untouched).
            ...(projects ? { projects: { deleteMany: {}, create: projects.map((projectId) => ({ projectId })) } } : {}),
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
