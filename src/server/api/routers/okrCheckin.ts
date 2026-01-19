import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Helper function to get start of week (Monday)
function getMondayWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Default agenda items for OKR check-ins
const DEFAULT_AGENDA_ITEMS = [
  {
    type: "STANDUP",
    title: "Quick Round Robin",
    durationMinutes: 5,
    order: 1,
  },
  {
    type: "BLOCKERS",
    title: "Blocker Discussion",
    durationMinutes: 7,
    order: 2,
  },
  {
    type: "OKR_REVIEW",
    title: "OKR Progress Check",
    durationMinutes: 5,
    order: 3,
  },
  {
    type: "PROJECT_HEALTH",
    title: "Project Health Overview",
    durationMinutes: 5,
    order: 4,
  },
  {
    type: "DISCUSSION",
    title: "Open Discussion",
    durationMinutes: 3,
    order: 5,
  },
];

export const okrCheckinRouter = createTRPCRouter({
  // Get or create the current week's check-in for a team
  getOrCreateCurrentCheckin: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const weekStartDate = getMondayWeekStart(new Date());

      // Verify user is a member of the team
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team to access OKR check-ins",
        });
      }

      // Try to find existing check-in for this week
      let checkin = await ctx.db.okrCheckin.findUnique({
        where: {
          teamId_weekStartDate: {
            teamId: input.teamId,
            weekStartDate,
          },
        },
        include: {
          facilitator: {
            select: { id: true, name: true, image: true },
          },
          statusUpdates: {
            include: {
              user: {
                select: { id: true, name: true, image: true },
              },
            },
          },
          agendaItems: {
            orderBy: { order: "asc" },
          },
        },
      });

      // Create new check-in if none exists
      if (!checkin) {
        checkin = await ctx.db.okrCheckin.create({
          data: {
            teamId: input.teamId,
            workspaceId: input.workspaceId,
            weekStartDate,
            facilitatorId: ctx.session.user.id,
            status: "PREPARING",
            agendaItems: {
              create: DEFAULT_AGENDA_ITEMS,
            },
          },
          include: {
            facilitator: {
              select: { id: true, name: true, image: true },
            },
            statusUpdates: {
              include: {
                user: {
                  select: { id: true, name: true, image: true },
                },
              },
            },
            agendaItems: {
              orderBy: { order: "asc" },
            },
          },
        });
      }

      return checkin;
    }),

  // Get the current check-in (read-only)
  getCurrentCheckin: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const weekStartDate = getMondayWeekStart(new Date());

      // Verify user is a member of the team
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team to access OKR check-ins",
        });
      }

      const checkin = await ctx.db.okrCheckin.findUnique({
        where: {
          teamId_weekStartDate: {
            teamId: input.teamId,
            weekStartDate,
          },
        },
        include: {
          facilitator: {
            select: { id: true, name: true, image: true },
          },
          statusUpdates: {
            include: {
              user: {
                select: { id: true, name: true, image: true },
              },
              comments: {
                include: {
                  author: {
                    select: { id: true, name: true, image: true },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          agendaItems: {
            orderBy: { order: "asc" },
          },
          team: {
            select: {
              id: true,
              name: true,
              members: {
                include: {
                  user: {
                    select: { id: true, name: true, image: true },
                  },
                },
              },
            },
          },
        },
      });

      return checkin;
    }),

  // Get all team updates for a check-in
  getTeamUpdates: protectedProcedure
    .input(
      z.object({
        okrCheckinId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user has access to this check-in via team membership
      const checkin = await ctx.db.okrCheckin.findUnique({
        where: { id: input.okrCheckinId },
        select: { teamId: true },
      });

      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "OKR check-in not found",
        });
      }

      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: checkin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const updates = await ctx.db.okrCheckinUpdate.findMany({
        where: { okrCheckinId: input.okrCheckinId },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          comments: {
            include: {
              author: {
                select: { id: true, name: true, image: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      return updates;
    }),

  // Upsert a user's status update
  upsertStatusUpdate: protectedProcedure
    .input(
      z.object({
        okrCheckinId: z.string(),
        accomplishments: z.string().optional(),
        blockers: z.string().optional(),
        priorities: z.string().optional(),
        isSubmitted: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user has access
      const checkin = await ctx.db.okrCheckin.findUnique({
        where: { id: input.okrCheckinId },
        select: { teamId: true, status: true },
      });

      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "OKR check-in not found",
        });
      }

      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: checkin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      // Upsert the status update
      const update = await ctx.db.okrCheckinUpdate.upsert({
        where: {
          okrCheckinId_userId: {
            okrCheckinId: input.okrCheckinId,
            userId: ctx.session.user.id,
          },
        },
        update: {
          accomplishments: input.accomplishments,
          blockers: input.blockers,
          priorities: input.priorities,
          isSubmitted: input.isSubmitted ?? false,
          submittedAt: input.isSubmitted ? new Date() : undefined,
        },
        create: {
          okrCheckinId: input.okrCheckinId,
          userId: ctx.session.user.id,
          accomplishments: input.accomplishments,
          blockers: input.blockers,
          priorities: input.priorities,
          isSubmitted: input.isSubmitted ?? false,
          submittedAt: input.isSubmitted ? new Date() : undefined,
        },
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return update;
    }),

  // Submit status update (mark as ready for review)
  submitStatusUpdate: protectedProcedure
    .input(
      z.object({
        okrCheckinId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user has access
      const checkin = await ctx.db.okrCheckin.findUnique({
        where: { id: input.okrCheckinId },
        select: { teamId: true },
      });

      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "OKR check-in not found",
        });
      }

      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: checkin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const update = await ctx.db.okrCheckinUpdate.update({
        where: {
          okrCheckinId_userId: {
            okrCheckinId: input.okrCheckinId,
            userId: ctx.session.user.id,
          },
        },
        data: {
          isSubmitted: true,
          submittedAt: new Date(),
        },
      });

      return update;
    }),

  // Add comment to a status update
  addComment: protectedProcedure
    .input(
      z.object({
        updateId: z.string(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user has access via team membership
      const update = await ctx.db.okrCheckinUpdate.findUnique({
        where: { id: input.updateId },
        include: {
          okrCheckin: {
            select: { teamId: true },
          },
        },
      });

      if (!update) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Status update not found",
        });
      }

      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: update.okrCheckin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const comment = await ctx.db.okrCheckinComment.create({
        data: {
          updateId: input.updateId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return comment;
    }),

  // Start the live meeting
  startMeeting: protectedProcedure
    .input(
      z.object({
        okrCheckinId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const checkin = await ctx.db.okrCheckin.findUnique({
        where: { id: input.okrCheckinId },
        select: { teamId: true, status: true, facilitatorId: true },
      });

      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "OKR check-in not found",
        });
      }

      // Only facilitator or team owner/admin can start
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: checkin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const canStart =
        checkin.facilitatorId === ctx.session.user.id ||
        membership.role === "owner" ||
        membership.role === "admin";

      if (!canStart) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the facilitator or team admin can start the meeting",
        });
      }

      if (checkin.status === "COMPLETED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This check-in has already been completed",
        });
      }

      const updated = await ctx.db.okrCheckin.update({
        where: { id: input.okrCheckinId },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
        include: {
          agendaItems: {
            orderBy: { order: "asc" },
          },
        },
      });

      return updated;
    }),

  // Complete the meeting
  completeMeeting: protectedProcedure
    .input(
      z.object({
        okrCheckinId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const checkin = await ctx.db.okrCheckin.findUnique({
        where: { id: input.okrCheckinId },
        select: { teamId: true, status: true, facilitatorId: true, startedAt: true },
      });

      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "OKR check-in not found",
        });
      }

      // Only facilitator or team owner/admin can complete
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: checkin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const canComplete =
        checkin.facilitatorId === ctx.session.user.id ||
        membership.role === "owner" ||
        membership.role === "admin";

      if (!canComplete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the facilitator or team admin can complete the meeting",
        });
      }

      // Calculate duration if started
      let durationMinutes: number | undefined;
      if (checkin.startedAt) {
        const durationMs = Date.now() - checkin.startedAt.getTime();
        durationMinutes = Math.round(durationMs / 1000 / 60);
      }

      const updated = await ctx.db.okrCheckin.update({
        where: { id: input.okrCheckinId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          durationMinutes,
          notes: input.notes,
        },
      });

      return updated;
    }),

  // Update an agenda item (mark complete, add notes)
  updateAgendaItem: protectedProcedure
    .input(
      z.object({
        agendaItemId: z.string(),
        isCompleted: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify access via check-in
      const agendaItem = await ctx.db.okrCheckinAgendaItem.findUnique({
        where: { id: input.agendaItemId },
        include: {
          okrCheckin: {
            select: { teamId: true },
          },
        },
      });

      if (!agendaItem) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agenda item not found",
        });
      }

      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: agendaItem.okrCheckin.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const updated = await ctx.db.okrCheckinAgendaItem.update({
        where: { id: input.agendaItemId },
        data: {
          isCompleted: input.isCompleted,
          completedAt: input.isCompleted ? new Date() : null,
          notes: input.notes,
        },
      });

      return updated;
    }),

  // Get check-in history for a team
  getCheckinHistory: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        limit: z.number().optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user is a member
      const membership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this team",
        });
      }

      const checkins = await ctx.db.okrCheckin.findMany({
        where: { teamId: input.teamId },
        orderBy: { weekStartDate: "desc" },
        take: input.limit,
        include: {
          facilitator: {
            select: { id: true, name: true, image: true },
          },
          _count: {
            select: { statusUpdates: true },
          },
        },
      });

      return checkins;
    }),

  // Get teams available for OKR check-ins (user's teams)
  getAvailableTeams: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const teams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
          team: {
            workspaceId: input.workspaceId,
          },
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              _count: {
                select: { members: true },
              },
            },
          },
        },
      });

      return teams.map((t) => ({
        ...t.team,
        memberCount: t.team._count.members,
        userRole: t.role,
      }));
    }),
});
