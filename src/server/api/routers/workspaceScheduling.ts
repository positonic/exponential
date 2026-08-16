import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { listBusyBlocksByUser } from "~/server/services/calendar/freeBusy";
import { computeSlots } from "~/server/services/calendar/slotEngine";
import { buildInviteIcs } from "~/server/services/calendar/inviteIcs";
import { sendMeetingInviteEmail } from "~/server/services/EmailService";

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

function assertSaneRange(rangeStart: Date, rangeEnd: Date) {
  if (rangeEnd <= rangeStart) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Range end must be after start" });
  }
  if (rangeEnd.getTime() - rangeStart.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Range must be at most ${MAX_RANGE_DAYS} days`,
    });
  }
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

      // Availability = at least one synced CalendarEvent row exists. This is
      // an existence probe, not an event read — no details leave the table.
      const withData = await db.calendarEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: members.map((m) => m.id) } },
      });
      const hasData = new Set(withData.map((row) => row.userId));

      return members.map((member) => ({
        ...member,
        availabilityKnown: hasData.has(member.id),
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
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as PrismaClient;
      await assertNotViewer(db, ctx.session.user.id, input.workspaceId);
      assertSaneRange(input.rangeStart, input.rangeEnd);

      const memberIds = await listWorkspaceMemberIds(db, input.workspaceId);
      const outsiders = input.attendeeUserIds.filter((id) => !memberIds.has(id));
      if (outsiders.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Attendees must be members of the workspace",
        });
      }

      const busyBlocksByUser = await listBusyBlocksByUser(db, input.attendeeUserIds, {
        from: input.rangeStart,
        to: input.rangeEnd,
      });

      const availabilityUnknownUserIds = input.attendeeUserIds.filter(
        (id) => (busyBlocksByUser.get(id) ?? []).length === 0,
      );

      const slots = computeSlots({
        busyBlocksByUser,
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
        attendeeUserIds: z.array(z.string()).min(1).max(50),
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

      const memberIds = await listWorkspaceMemberIds(db, input.workspaceId);
      if (input.attendeeUserIds.some((id) => !memberIds.has(id))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Attendees must be members of the workspace",
        });
      }

      // The organizer is always an attendee — their calendar gets the invite too.
      const attendeeIds = [...new Set([...input.attendeeUserIds, organizerId])];

      const meeting = await db.meeting.create({
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
          attendees: { create: attendeeIds.map((userId) => ({ userId })) },
        },
        include: {
          attendees: { include: { user: { select: { id: true, name: true, email: true } } } },
          organizer: { select: { id: true, name: true, email: true } },
        },
      });

      // Email every attendee with a real address. Send failures must not
      // roll back the meeting — the record is the source of truth and a
      // resend is cheaper than a phantom double-booking.
      const organizer = {
        name: meeting.organizer.name,
        email: meeting.organizer.email ?? "noreply@exponential.im",
      };
      const recipients = meeting.attendees
        .map((a) => a.user)
        .filter((u): u is typeof u & { email: string } => !!u.email);
      const ics = buildInviteIcs({
        method: "REQUEST",
        uid: meeting.icalUid,
        sequence: meeting.sequence,
        organizer,
        attendees: recipients.map((u) => ({ name: u.name, email: u.email })),
        title: meeting.title,
        description: meeting.description,
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
      };
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
          attendees: { select: { user: { select: { id: true, name: true } } } },
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
