import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { startOfDay, endOfDay, subDays } from "date-fns";

/**
 * Morning Briefing Router
 * 
 * Generates automated digests combining:
 * - Calendar events for today
 * - Actions due today and overdue
 * - Projects with low progress (< 50%)
 * - Recent meeting notes/transcriptions
 */

export interface BriefingCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  isAllDay: boolean;
}

export interface BriefingAction {
  id: string;
  name: string;
  dueDate: Date | null;
  priority: string;
  projectName: string | null;
  isOverdue: boolean;
}

export interface BriefingProject {
  id: string;
  name: string;
  progress: number;
  status: string;
  actionCount: number;
}

export interface BriefingTranscription {
  id: string;
  title: string;
  summary: string | null;
  createdAt: Date;
  projectName: string | null;
}

export interface MorningBriefing {
  date: Date;
  greeting: string;
  calendarEvents: BriefingCalendarEvent[];
  actionsDueToday: BriefingAction[];
  overdueActions: BriefingAction[];
  projectsNeedingAttention: BriefingProject[];
  recentMeetingNotes: BriefingTranscription[];
  summary: {
    totalEvents: number;
    totalActionsDue: number;
    totalOverdue: number;
    projectsAtRisk: number;
  };
}

export const briefingRouter = createTRPCRouter({
  /**
   * Get morning briefing for today
   */
  getMorningBriefing: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        includeCalendar: z.boolean().default(true),
        includeMeetingNotes: z.boolean().default(true),
        meetingNotesDays: z.number().default(3), // How many days back to look for meeting notes
      }).optional()
    )
    .query(async ({ ctx, input }): Promise<MorningBriefing> => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const workspaceId = input?.workspaceId;

      // Get user's name for greeting
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const firstName = user?.name?.split(" ")[0] ?? "there";

      // Generate time-appropriate greeting
      const hour = now.getHours();
      let greetingPrefix = "Good morning";
      if (hour >= 12 && hour < 17) greetingPrefix = "Good afternoon";
      if (hour >= 17) greetingPrefix = "Good evening";

      // 1. Get calendar events for today (if calendar is connected)
      let calendarEvents: BriefingCalendarEvent[] = [];
      if (input?.includeCalendar !== false) {
        try {
          // Check if Google Calendar is connected
          const googleAccount = await ctx.db.account.findFirst({
            where: {
              userId,
              provider: "google",
            },
            select: { scope: true },
          });

          if (googleAccount?.scope?.includes("calendar.events")) {
            // Import the service dynamically to avoid circular deps
            const { GoogleCalendarService } = await import(
              "~/server/services/GoogleCalendarService"
            );
            const calendarService = new GoogleCalendarService();
            
            const events = await calendarService.getTodayEvents(userId);
            calendarEvents = events.map((e) => ({
              id: e.id,
              title: e.summary,
              start: e.start.dateTime ? new Date(e.start.dateTime) : todayStart,
              end: e.end.dateTime ? new Date(e.end.dateTime) : todayEnd,
              location: e.location,
              isAllDay: !!e.start.date && !e.start.dateTime,
            }));
          }
        } catch (error) {
          console.error("[briefing] Failed to fetch calendar events:", error);
          // Continue without calendar events
        }
      }

      // 2. Get actions due today
      const actionsDueTodayRaw = await ctx.db.action.findMany({
        where: {
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId } } },
          ],
          status: "ACTIVE",
          dueDate: {
            gte: todayStart,
            lte: todayEnd,
          },
          ...(workspaceId ? { project: { workspaceId } } : {}),
        },
        include: {
          project: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      });

      const actionsDueToday: BriefingAction[] = actionsDueTodayRaw.map((a) => ({
        id: a.id,
        name: a.name,
        dueDate: a.dueDate,
        priority: a.priority ?? "NONE",
        projectName: a.project?.name ?? null,
        isOverdue: false,
      }));

      // 3. Get overdue actions
      const overdueActionsRaw = await ctx.db.action.findMany({
        where: {
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId } } },
          ],
          status: "ACTIVE",
          dueDate: {
            lt: todayStart,
          },
          ...(workspaceId ? { project: { workspaceId } } : {}),
        },
        include: {
          project: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 20,
      });

      const overdueActions: BriefingAction[] = overdueActionsRaw.map((a) => ({
        id: a.id,
        name: a.name,
        dueDate: a.dueDate,
        priority: a.priority ?? "NONE",
        projectName: a.project?.name ?? null,
        isOverdue: true,
      }));

      // 4. Get projects with progress < 50% (needing attention)
      const projectsNeedingAttentionRaw = await ctx.db.project.findMany({
        where: {
          createdById: userId,
          status: "ACTIVE",
          progress: { lt: 50 },
          ...(workspaceId ? { workspaceId } : {}),
        },
        include: {
          _count: {
            select: { actions: { where: { status: "ACTIVE" } } },
          },
        },
        orderBy: { progress: "asc" },
        take: 10,
      });

      const projectsNeedingAttention: BriefingProject[] =
        projectsNeedingAttentionRaw.map((p) => ({
          id: p.id,
          name: p.name,
          progress: p.progress,
          status: p.status,
          actionCount: p._count.actions,
        }));

      // 5. Get recent meeting notes/transcriptions
      let recentMeetingNotes: BriefingTranscription[] = [];
      if (input?.includeMeetingNotes !== false) {
        const meetingNotesDays = input?.meetingNotesDays ?? 3;
        const lookbackDate = subDays(now, meetingNotesDays);

        const transcriptionsRaw = await ctx.db.transcriptionSession.findMany({
          where: {
            userId,
            createdAt: { gte: lookbackDate },
            ...(workspaceId ? { project: { workspaceId } } : {}),
          },
          include: {
            project: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        });

        recentMeetingNotes = transcriptionsRaw.map((t) => ({
          id: t.id,
          title: t.title ?? "Meeting Notes",
          summary: t.summary,
          createdAt: t.createdAt,
          projectName: t.project?.name ?? null,
        }));
      }

      // Generate greeting with context
      let greeting = `${greetingPrefix}, ${firstName}!`;
      if (overdueActions.length > 0) {
        greeting += ` You have ${overdueActions.length} overdue item${overdueActions.length > 1 ? "s" : ""} to address.`;
      } else if (actionsDueToday.length > 0) {
        greeting += ` You have ${actionsDueToday.length} thing${actionsDueToday.length > 1 ? "s" : ""} to do today.`;
      } else if (calendarEvents.length > 0) {
        greeting += ` You have ${calendarEvents.length} event${calendarEvents.length > 1 ? "s" : ""} on your calendar.`;
      } else {
        greeting += " Looks like a clear day ahead.";
      }

      return {
        date: now,
        greeting,
        calendarEvents,
        actionsDueToday,
        overdueActions,
        projectsNeedingAttention,
        recentMeetingNotes,
        summary: {
          totalEvents: calendarEvents.length,
          totalActionsDue: actionsDueToday.length,
          totalOverdue: overdueActions.length,
          projectsAtRisk: projectsNeedingAttention.length,
        },
      };
    }),

  /**
   * Get a text-based summary suitable for notifications/messages
   */
  getBriefingText: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        format: z.enum(["short", "detailed"]).default("short"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Reuse the main briefing query
      const briefing = await ctx.db.$transaction(async () => {
        // We'll call the main query logic inline to avoid circular issues
        const userId = ctx.session.user.id;
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);
        const workspaceId = input?.workspaceId;

        // Count actions due today
        const actionsDueCount = await ctx.db.action.count({
          where: {
            OR: [
              { createdById: userId, assignees: { none: {} } },
              { assignees: { some: { userId } } },
            ],
            status: "ACTIVE",
            dueDate: { gte: todayStart, lte: todayEnd },
            ...(workspaceId ? { project: { workspaceId } } : {}),
          },
        });

        // Count overdue actions
        const overdueCount = await ctx.db.action.count({
          where: {
            OR: [
              { createdById: userId, assignees: { none: {} } },
              { assignees: { some: { userId } } },
            ],
            status: "ACTIVE",
            dueDate: { lt: todayStart },
            ...(workspaceId ? { project: { workspaceId } } : {}),
          },
        });

        // Count projects needing attention
        const projectsAtRiskCount = await ctx.db.project.count({
          where: {
            createdById: userId,
            status: "ACTIVE",
            progress: { lt: 50 },
            ...(workspaceId ? { workspaceId } : {}),
          },
        });

        return { actionsDueCount, overdueCount, projectsAtRiskCount };
      });

      // Build text summary
      const parts: string[] = [];

      if (briefing.overdueCount > 0) {
        parts.push(`🔴 ${briefing.overdueCount} overdue`);
      }
      if (briefing.actionsDueCount > 0) {
        parts.push(`📋 ${briefing.actionsDueCount} due today`);
      }
      if (briefing.projectsAtRiskCount > 0) {
        parts.push(`⚠️ ${briefing.projectsAtRiskCount} projects need attention`);
      }

      if (parts.length === 0) {
        return "✅ All clear! No urgent items.";
      }

      return parts.join(" • ");
    }),
});
