import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { listBusyBlocksByUser } from "~/server/services/calendar/freeBusy";
import {
  computeSlots,
  computeAvailabilityGrid,
  type AttendeeWorkSettings,
} from "~/server/services/calendar/slotEngine";
import { buildInviteIcs } from "~/server/services/calendar/inviteIcs";
import { cancelScheduledMeeting } from "~/server/services/calendar/cancelScheduledMeeting";
import { sendMeetingInviteEmail } from "~/server/services/EmailService";
import { getProjectAccess, hasProjectAccess } from "~/server/services/access/resolvers/projectResolver";
import { recordActivity } from "~/server/services/activity/recordActivity";
import { personSchema, resolvePerson, type Person } from "~/server/services/meetings/resolvePerson";
import { formatOccurrenceLabel } from "~/server/services/ceremonies/activity";
import { generateAgenda } from "~/server/services/ceremonies/agenda/generateAgenda";
import {
  ONE_OFF_SECTION_TYPES,
  buildOccurrenceUrl,
  buildOneOffAgendaTemplate,
  createOneOffCeremony,
} from "~/server/services/ceremonies/oneOff";

/**
 * Workspace meeting scheduling (V3 of calendar sync).
 *
 * Access model: every procedure requires workspace membership AND explicitly
 * rejects the "viewer" role server-side. The middleware's "view" level alone
 * is deliberately not trusted for this — cf. the known feature.update viewer
 * gap — so the role check is its own step in each procedure.
 *
 * Privacy: availability is read exclusively through listBusyBlocksByUser
 * (the structural free/busy contract). No procedure here ever selects
 * another user's event title/location/attendees.
 */

const MAX_RANGE_DAYS = 30;
/** availabilityGrid pages a week at a time; its payload grows per cell. */
const MAX_GRID_RANGE_DAYS = 10;

/**
 * Reject workspace viewers. Direct members carry their WorkspaceUser role;
 * team-based members have no direct row and count as "member" (the same
 * synthesis workspace.list applies), so absence of a direct row is fine —
 * the membership middleware has already vouched for access.
 */
async function assertNotViewer(db: PrismaClient, userId: string, workspaceId: string) {
  const direct = await db.workspaceUser.findFirst({
    where: { workspaceId, userId },
    select: { role: true },
  });
  if (direct?.role === "viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Workspace viewers cannot schedule meetings",
    });
  }
}

/**
 * The attendee row's email for a member: their address, lowercased, or the
 * `user:<id>` sentinel (shared with the migration backfill) when they have
 * none — the row stays unique per meeting and is never emailed.
 */
function memberAttendeeEmail(user: { id: string; email: string | null }): string {
  return user.email ? user.email.trim().toLowerCase() : `user:${user.id}`;
}

function isDeliverableEmail(email: string): boolean {
  return email.includes("@");
}

const MAX_ATTENDEES = 50;

/**
 * Resolve the booking's people into attendee rows through the shared person
 * service: the organizer always (as a member), then each requested person.
 * The invite is the only write to anyone's calendar, so a person who
 * resolves to no email is refused — unlike a recorded Meeting's
 * Participants, where a name-only row is fine. One row per email; the first
 * mention wins, so the organizer and members keep their user link.
 */
async function resolveAttendees(
  tx: Prisma.TransactionClient,
  args: {
    workspaceId: string;
    organizer: { id: string; name: string | null; email: string | null };
    people: Person[];
    memberIds: ReadonlySet<string>;
  },
): Promise<Array<{ userId: string | null; contactId: string | null; email: string; name: string | null }>> {
  const rows = new Map<string, { userId: string | null; contactId: string | null; email: string; name: string | null }>();
  const organizerEmail = memberAttendeeEmail(args.organizer);
  rows.set(organizerEmail, { userId: args.organizer.id, contactId: null, email: organizerEmail, name: args.organizer.name });

  for (const person of args.people) {
    if (person.userId === args.organizer.id) continue;
    const resolved = await resolvePerson(tx, {
      workspaceId: args.workspaceId,
      actorId: args.organizer.id,
      person,
      memberIds: args.memberIds,
    });
    if (!resolved.email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${resolved.name ?? person.name ?? "An attendee"} has no email address, so they can't be sent an invite`,
      });
    }
    const email = resolved.email.trim().toLowerCase();
    if (!rows.has(email)) rows.set(email, { ...resolved, email });
  }
  return [...rows.values()];
}

/** The attendee universe: direct members + members via a linked team. */
async function listWorkspaceMemberIds(db: PrismaClient, workspaceId: string): Promise<Set<string>> {
  const [direct, viaTeam] = await Promise.all([
    db.workspaceUser.findMany({ where: { workspaceId }, select: { userId: true } }),
    db.teamUser.findMany({
      where: { team: { workspaceId } },
      select: { userId: true },
    }),
  ]);
  return new Set([...direct.map((m) => m.userId), ...viaTeam.map((m) => m.userId)]);
}

/**
 * Work-hours settings for a set of users (self-describing fields, not event
 * data — no privacy concern) plus the organizer's timezone, the fallback
 * zone for attendees who never set one.
 */
async function loadAttendeeSettings(
  db: PrismaClient,
  attendeeUserIds: string[],
  organizerId: string,
): Promise<{ attendeeSettings: Map<string, AttendeeWorkSettings>; organizerTimezone: string | null }> {
  const [attendeeRows, organizerRow] = await Promise.all([
    db.user.findMany({
      where: { id: { in: attendeeUserIds } },
      select: {
        id: true,
        workHoursEnabled: true,
        workDaysJson: true,
        workHoursStart: true,
        workHoursEnd: true,
        timezone: true,
      },
    }),
    db.user.findUnique({
      where: { id: organizerId },
      select: { timezone: true },
    }),
  ]);
  const attendeeSettings = new Map<string, AttendeeWorkSettings>(
    attendeeRows.map((row) => {
      let workDays: string[] = [];
      if (row.workDaysJson) {
        try {
          workDays = (JSON.parse(row.workDaysJson) as string[]).map((d) => d.toLowerCase());
        } catch {
          workDays = [];
        }
      }
      return [
        row.id,
        {
          workHoursEnabled: row.workHoursEnabled,
          workDays,
          workHoursStart: row.workHoursStart,
          workHoursEnd: row.workHoursEnd,
          timezone: row.timezone,
        },
      ] as const;
    }),
  );
  return { attendeeSettings, organizerTimezone: organizerRow?.timezone ?? null };
}

function assertSaneRange(rangeStart: Date, rangeEnd: Date, maxDays: number = MAX_RANGE_DAYS) {
  if (rangeEnd <= rangeStart) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Range end must be after start" });
  }
  if (rangeEnd.getTime() - rangeStart.getTime() > maxDays * 24 * 60 * 60 * 1000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Range must be at most ${maxDays} days`,
    });
  }
  // Scheduling looks forward. A range entirely in the past has no product
  // purpose and would let a member walk back through colleagues' busy-block
  // history 30 days at a time (ADR-0058 blesses existence-visibility for
  // scheduling, not retrospective mining).
  if (rangeEnd.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Range is entirely in the past" });
  }
}

/**
 * The shared read path of suggestSlots and availabilityGrid: validate the
 * attendee roster, union in the organizer (they always end up an attendee,
 * so their calendar constrains too), and load busy blocks + work settings.
 * One copy so the membership/organizer policy can't drift between the two.
 */
async function loadSchedulingContext(
  db: PrismaClient,
  input: { workspaceId: string; attendeeUserIds: string[]; rangeStart: Date; rangeEnd: Date },
  organizerId: string,
) {
  const memberIds = await listWorkspaceMemberIds(db, input.workspaceId);
  if (input.attendeeUserIds.some((id) => !memberIds.has(id))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Attendees must be members of the workspace",
    });
  }
  const allAttendeeIds = [...new Set([...input.attendeeUserIds, organizerId])];
  const busyBlocksByUser = await listBusyBlocksByUser(db, allAttendeeIds, {
    from: input.rangeStart,
    to: input.rangeEnd,
  });
  const { attendeeSettings, organizerTimezone } = await loadAttendeeSettings(
    db,
    allAttendeeIds,
    organizerId,
  );
  return { allAttendeeIds, busyBlocksByUser, attendeeSettings, organizerTimezone };
}

export const workspaceSchedulingRouter = createTRPCRouter({
  /**
   * Workspace members offerable as attendees, with an availability flag:
   * a member with no synced calendar source is availability-unknown — still
   * invitable, never constraining suggestions.
   */
  listSchedulableMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      await assertNotViewer(db, ctx.session.user.id, input.workspaceId);

      const userSelect = { id: true, name: true, email: true, image: true } as const;
      const [direct, viaTeam] = await Promise.all([
        db.workspaceUser.findMany({
          where: { workspaceId: input.workspaceId },
          select: { user: { select: userSelect } },
        }),
        db.teamUser.findMany({
          where: { team: { workspaceId: input.workspaceId } },
          select: { user: { select: userSelect } },
        }),
      ]);

      const byId = new Map<string, { id: string; name: string | null; email: string | null; image: string | null }>();
      for (const row of [...direct, ...viaTeam]) byId.set(row.user.id, row.user);
      const members = [...byId.values()];

      // Availability = at least one synced CalendarEvent row exists (the
      // shared existence probe — not an event read).
      const unknown = new Set(await filterTrulyUnknown(db, members.map((m) => m.id)));

      return members.map((member) => ({
        ...member,
        availabilityKnown: !unknown.has(member.id),
      }));
    }),

  suggestSlots: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        attendeeUserIds: z.array(z.string()).min(1).max(50),
        durationMinutes: z.number().int().min(15).max(8 * 60),
        rangeStart: z.date(),
        rangeEnd: z.date(),
        includeOutsideWorkHours: z.boolean().default(false),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      await assertNotViewer(db, ctx.session.user.id, input.workspaceId);
      assertSaneRange(input.rangeStart, input.rangeEnd);

      const { allAttendeeIds, busyBlocksByUser, attendeeSettings, organizerTimezone } =
        await loadSchedulingContext(db, input, ctx.session.user.id);

      const availabilityUnknownUserIds = allAttendeeIds.filter(
        (id) => (busyBlocksByUser.get(id) ?? []).length === 0,
      );

      const slots = computeSlots({
        busyBlocksByUser,
        attendeeSettings,
        organizerTimezone,
        includeOutsideWorkHours: input.includeOutsideWorkHours,
        durationMinutes: input.durationMinutes,
        range: { from: input.rangeStart, to: input.rangeEnd },
      });

      return {
        slots,
        // Blocks-in-range is a heuristic for "has data" here; a member can be
        // genuinely free all range. Cross-checked against synced sources so a
        // truly connected-but-free attendee isn't mislabelled.
        availabilityUnknownUserIds: await filterTrulyUnknown(
          db,
          availabilityUnknownUserIds,
        ),
      };
    }),

  /**
   * Per-attendee, per-cell availability for the grid view. Exposes each
   * attendee's busy CELLS (quantized times only — the structural free/busy
   * contract still guarantees no titles/locations/attendees) to non-viewer
   * workspace members. Decision: ADR-0058 — free/busy existence is
   * workspace-visible; event content never is.
   */
  availabilityGrid: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        attendeeUserIds: z.array(z.string()).min(1).max(50),
        rangeStart: z.date(),
        rangeEnd: z.date(),
        includeOutsideWorkHours: z.boolean().default(false),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      await assertNotViewer(db, ctx.session.user.id, input.workspaceId);
      // Tighter cap than suggestSlots: the client only ever pages a week at
      // a time, and each extra day is ~48 cells × attendees in the payload.
      assertSaneRange(input.rangeStart, input.rangeEnd, MAX_GRID_RANGE_DAYS);

      const { allAttendeeIds, busyBlocksByUser, attendeeSettings, organizerTimezone } =
        await loadSchedulingContext(db, input, ctx.session.user.id);

      const grid = computeAvailabilityGrid({
        busyBlocksByUser,
        attendeeSettings,
        organizerTimezone,
        includeOutsideWorkHours: input.includeOutsideWorkHours,
        range: { from: input.rangeStart, to: input.rangeEnd },
      });

      const emptyInRange = allAttendeeIds.filter(
        (id) => (busyBlocksByUser.get(id) ?? []).length === 0,
      );

      return {
        ...grid,
        availabilityUnknownUserIds: await filterTrulyUnknown(db, emptyInRange),
      };
    }),

  /**
   * Book a Scheduled meeting. With a project linked, the booking is also a
   * one-off Ceremony (ADR-0059 amendment, 2026-10-07): ceremony, occurrence
   * and meeting are written in one transaction, the agenda is generated
   * inline so the organizer sees a draft, and the invite carries the purpose
   * and the occurrence link. Without a project it is exactly a calendar
   * booking. Either way the only write to real calendars is the invite email.
   */
  createMeeting: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(10_000).optional(),
        location: z.string().max(500).optional(),
        projectId: z.string().optional(),
        startsAt: z.date(),
        endsAt: z.date(),
        /**
         * Members, CRM contacts, or new people by name + email (CONTEXT.md →
         * Attendee). Externals are invited; only members have availability.
         */
        attendees: z.array(personSchema).max(MAX_ATTENDEES).optional(),
        /** Alias kept for existing callers: each id is a member attendee. */
        attendeeUserIds: z.array(z.string()).max(MAX_ATTENDEES).optional(),
        /** What the meeting is for; the one-off's `purpose` and the invite's first line. */
        purpose: z.string().trim().max(2000).optional(),
        /** The one-off agenda's sections; recurring-only sections are refused. */
        agendaSectionTypes: z.array(z.enum(ONE_OFF_SECTION_TYPES)).max(ONE_OFF_SECTION_TYPES.length).optional(),
        /** Which preset the organizer started from; titles the sections, and is kept on the activity event. */
        purposePreset: z.string().max(40).optional(),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      const organizerId = ctx.session.user.id;
      await assertNotViewer(db, organizerId, input.workspaceId);

      if (input.endsAt <= input.startsAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meeting must end after it starts" });
      }

      const people: Person[] = [
        ...(input.attendees ?? []),
        ...(input.attendeeUserIds ?? []).map((userId) => ({ userId })),
      ];
      if (people.length === 0 || people.length > MAX_ATTENDEES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invite between 1 and ${MAX_ATTENDEES} attendees`,
        });
      }

      // Member attendees must be workspace members; contacts and emails need not be.
      const memberIds = await listWorkspaceMemberIds(db, input.workspaceId);
      if (people.some((p) => p.userId && !memberIds.has(p.userId))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Attendees must be members of the workspace",
        });
      }

      // A one-off reviews the project, so the organizer must be able to see it.
      if (input.projectId) {
        const project = await db.project.findFirst({
          where: { id: input.projectId, workspaceId: input.workspaceId },
          select: { id: true },
        });
        if (!project || !hasProjectAccess(await getProjectAccess(db, organizerId, input.projectId))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Project not found in this workspace" });
        }
      }

      const organizerUser = await db.user.findUnique({
        where: { id: organizerId },
        select: { id: true, name: true, email: true, timezone: true },
      });
      if (!organizerUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const purpose = input.purpose && input.purpose.length > 0 ? input.purpose : undefined;
      const meetingInclude = {
        attendees: true,
        organizer: { select: { id: true, name: true, email: true } },
        workspace: { select: { slug: true } },
      } as const;

      const { meeting, oneOff } = await db.$transaction(async (tx) => {
        // Resolution may create a CRM contact for a new email, so it runs
        // inside the booking: a refused attendee leaves nothing behind.
        const attendeeRows = await resolveAttendees(tx, {
          workspaceId: input.workspaceId,
          organizer: organizerUser,
          people,
          memberIds,
        });
        const meeting = await tx.meeting.create({
          data: {
            workspaceId: input.workspaceId,
            organizerId,
            projectId: input.projectId,
            title: input.title,
            description: input.description,
            location: input.location,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            // Stable for the meeting's lifetime; the domain suffix keeps UIDs
            // globally unique across calendar systems.
            icalUid: `${crypto.randomUUID()}@exponential.im`,
            attendees: { create: attendeeRows },
          },
          include: meetingInclude,
        });
        if (!input.projectId) return { meeting, oneOff: null };

        const oneOffPurpose = purpose ?? input.title;
        const oneOff = await createOneOffCeremony(tx, {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          organizerId,
          meetingId: meeting.id,
          title: input.title,
          purpose: oneOffPurpose,
          agendaTemplate: buildOneOffAgendaTemplate({
            purpose: oneOffPurpose,
            sectionTypes: input.agendaSectionTypes,
            presetKey: input.purposePreset,
          }),
          // External attendees live on the meeting only.
          memberUserIds: attendeeRows.flatMap((a) => (a.userId ? [a.userId] : [])),
          timezone: organizerUser.timezone ?? "UTC",
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        });
        return { meeting, oneOff };
      });

      let occurrenceUrl: string | null = null;
      if (oneOff) {
        occurrenceUrl = buildOccurrenceUrl(meeting.workspace.slug, oneOff.ceremony.id, oneOff.occurrenceId);
        await recordActivity(db, {
          workspaceId: input.workspaceId,
          userId: organizerId,
          entityType: "ceremony_occurrence",
          entityId: oneOff.occurrenceId,
          action: "created",
          metadata: {
            name: formatOccurrenceLabel(oneOff.ceremony.name, input.startsAt, oneOff.ceremony.timezone),
            ceremonyId: oneOff.ceremony.id,
            meetingId: meeting.id,
            oneOff: true,
            purposePreset: input.purposePreset ?? null,
          },
        });
        // Inline, never fire-and-forget: the organizer lands on a draft. The
        // occurrence stays PLANNED, so the lead-time sweep regenerates and
        // circulates it with fresh data. A failure here must not undo a
        // booking that is already durable — the sweep retries.
        try {
          await generateAgenda(db, oneOff.occurrenceId);
        } catch (error) {
          const { reportHandledErrorServer } = await import(
            "~/server/utils/reportHandledErrorServer"
          );
          reportHandledErrorServer(error, {
            area: "workspaceScheduling.createMeeting.agenda",
            context: { meetingId: meeting.id, occurrenceId: oneOff.occurrenceId },
          });
        }
      }

      // Email every attendee with a real address. Send failures must not
      // roll back the meeting — the record is the source of truth and a
      // resend is cheaper than a phantom double-booking.
      const organizer = {
        name: meeting.organizer.name,
        email: meeting.organizer.email ?? "noreply@exponential.im",
      };
      const recipients = meeting.attendees.filter((a) => isDeliverableEmail(a.email));
      const inviteDescription = [purpose, meeting.description, occurrenceUrl]
        .filter((part): part is string => !!part)
        .join("\n\n");
      const ics = buildInviteIcs({
        method: "REQUEST",
        uid: meeting.icalUid,
        sequence: meeting.sequence,
        organizer,
        attendees: recipients.map((a) => ({ name: a.name, email: a.email })),
        title: meeting.title,
        description: inviteDescription || null,
        location: meeting.location,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
      });

      const invitesSent: string[] = [];
      for (const recipient of recipients) {
        try {
          await sendMeetingInviteEmail({
            to: recipient.email,
            method: "REQUEST",
            meetingTitle: meeting.title,
            organizerName: organizer.name ?? organizer.email,
            startsAt: meeting.startsAt,
            endsAt: meeting.endsAt,
            location: meeting.location,
            description: purpose,
            url: occurrenceUrl,
            icsContent: ics,
            workspaceId: input.workspaceId,
          });
          invitesSent.push(recipient.email);
        } catch (error) {
          const { reportHandledErrorServer } = await import(
            "~/server/utils/reportHandledErrorServer"
          );
          reportHandledErrorServer(error, {
            area: "workspaceScheduling.createMeeting.invite",
            context: { meetingId: meeting.id },
          });
        }
      }

      return {
        id: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        status: meeting.status,
        attendeeCount: meeting.attendees.length,
        invitesSent: invitesSent.length,
        ceremonyId: oneOff?.ceremony.id ?? null,
        occurrenceId: oneOff?.occurrenceId ?? null,
      };
    }),

  /**
   * Cancel = the only mutation after create (reschedule is cancel + rebook,
   * a V3 non-goal). Bumps SEQUENCE and emails METHOD:CANCEL against the
   * original UID, which is what removes the event from attendees' real
   * calendars. Organizer-only. Cancelling a one-off ceremony's booking also
   * skips its occurrence and deactivates the ceremony (see the service).
   */
  cancelMeeting: protectedProcedure
    .input(z.object({ workspaceId: z.string(), meetingId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      const userId = ctx.session.user.id;
      await assertNotViewer(db, userId, input.workspaceId);

      const meeting = await db.meeting.findFirst({
        where: { id: input.meetingId, workspaceId: input.workspaceId },
        select: { id: true, organizerId: true },
      });
      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }
      if (meeting.organizerId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the organizer can cancel a meeting",
        });
      }
      return cancelScheduledMeeting(db, {
        workspaceId: input.workspaceId,
        meetingId: meeting.id,
        actorUserId: userId,
      });
    }),

  listMeetings: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        from: z.date().optional(),
        to: z.date().optional(),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      await assertNotViewer(db, ctx.session.user.id, input.workspaceId);

      return db.meeting.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.from ? { endsAt: { gt: input.from } } : {}),
          ...(input.to ? { startsAt: { lt: input.to } } : {}),
        },
        select: {
          id: true,
          title: true,
          location: true,
          startsAt: true,
          endsAt: true,
          status: true,
          organizer: { select: { id: true, name: true } },
          attendees: { select: { email: true, name: true, user: { select: { id: true, name: true } } } },
        },
        orderBy: { startsAt: "asc" },
      });
    }),
});

/**
 * An attendee with zero blocks in range is only availability-UNKNOWN when
 * they also have no synced calendar source at all — an empty week from a
 * connected calendar is real availability.
 */
async function filterTrulyUnknown(db: PrismaClient, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const withAnyData = await db.calendarEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
  });
  const hasData = new Set(withAnyData.map((row) => row.userId));
  return userIds.filter((id) => !hasData.has(id));
}
