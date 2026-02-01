import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { GoogleCalendarService, type CalendarEvent } from "~/server/services/GoogleCalendarService";
import { AutoSchedulingService } from "~/server/services/AutoSchedulingService";
import { generateAgentJWT } from "~/server/utils/jwt";
import { addMinutes, format } from "date-fns";
import { setTimeInUserTimezone } from "~/lib/dateUtils";

const MASTRA_API_URL = process.env.MASTRA_API_URL;

// Schema for scheduling suggestion output
const SchedulingSuggestionSchema = z.object({
  actionId: z.string(),
  suggestedDate: z.string(), // ISO date string "YYYY-MM-DD"
  suggestedTime: z.string(), // "HH:MM" format
  duration: z.number().optional(), // minutes
  reasoning: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  conflictWarning: z.string().optional(),
});

type SchedulingSuggestion = z.infer<typeof SchedulingSuggestionSchema>;

// System prompt for the scheduling AI
const SCHEDULING_SYSTEM_PROMPT = `You are a scheduling assistant that helps prioritize and reschedule overdue tasks.

Your goal is to find optimal time slots for each overdue action based on:
1. Outcome deadlines - Tasks linked to outcomes with closer deadlines should be scheduled sooner
2. Task priority - Higher priority tasks (Big Rock, Focus) should be scheduled in prime working hours
3. Calendar availability - Avoid conflicts with existing calendar events
4. Already scheduled actions - Don't double-book with existing scheduled tasks
5. Natural work patterns - Morning (9-12) for focused work, afternoon for meetings/collaboration

Return your suggestions as a JSON object with this exact structure:
{
  "suggestions": [
    {
      "actionId": "the-action-id",
      "suggestedDate": "2025-01-17",
      "suggestedTime": "09:00",
      "duration": 60,
      "reasoning": "Brief explanation of why this time was chosen",
      "priority": "high",
      "conflictWarning": "Optional warning about nearby events"
    }
  ]
}

Guidelines:
- Schedule highest-priority items (Big Rock, Focus) in morning slots (9-12)
- Quick tasks can be scheduled in afternoon gaps
- Leave 15-min buffers around meetings when possible
- Consider typical working hours (9 AM - 6 PM)
- If an action is linked to an outcome with an urgent deadline, flag it with "high" priority
- If all time slots are busy on a day, suggest the next available day
- Always provide reasoning for your suggestions

IMPORTANT: Return ONLY valid JSON, no markdown formatting or explanations outside the JSON.`;

// System prompt for daily plan scheduling AI
const DAILY_PLAN_SCHEDULING_PROMPT = `You are a daily planning assistant that helps schedule tasks for a single day.

Your goal is to find optimal time slots for each task based on:
1. Task duration - Ensure enough time is allocated
2. Calendar availability - Avoid conflicts with existing calendar events
3. Already scheduled tasks - Don't double-book
4. Natural work patterns - Morning (9-12) for focused/creative work, afternoon for administrative tasks
5. Task order - Earlier tasks in the list may have higher priority

Return your suggestions as a JSON object with this exact structure:
{
  "suggestions": [
    {
      "taskId": "the-task-id",
      "suggestedTime": "09:00",
      "duration": 60,
      "reasoning": "Brief explanation of why this time slot was chosen",
      "priority": "high",
      "conflictWarning": "Optional warning about nearby events"
    }
  ]
}

Guidelines:
- All suggestions must be for the specified planning date
- Schedule focused/creative work in morning slots (9-12)
- Quick tasks (30 min or less) can be scheduled in gaps between meetings
- Leave 15-min buffers around calendar events when possible
- If a task is marked as high priority, schedule it in prime working hours
- Consider the user's work hours (provided in the prompt)
- Always provide reasoning for your suggestions

IMPORTANT: Return ONLY valid JSON, no markdown formatting or explanations outside the JSON.`;

// Schema for daily plan scheduling suggestion
const DailyPlanSuggestionSchema = z.object({
  taskId: z.string(),
  suggestedTime: z.string(), // "HH:MM" format
  duration: z.number().optional(),
  reasoning: z.string(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  conflictWarning: z.string().optional(),
});

type DailyPlanSuggestion = z.infer<typeof DailyPlanSuggestionSchema>;

interface DailyPlanTask {
  id: string;
  name: string;
  duration: number;
  sortOrder: number;
}

function buildDailyPlanSchedulingPrompt(
  tasks: DailyPlanTask[],
  calendarEvents: CalendarEvent[],
  scheduledTasks: Array<{ id: string; name: string; scheduledStart: Date; scheduledEnd: Date | null; duration: number }>,
  planDate: Date,
  workHoursStart: string,
  workHoursEnd: string
): string {
  const dateStr = format(planDate, "yyyy-MM-dd");

  // Build tasks section
  const tasksSection = tasks.map((t) => {
    return `- ID: ${t.id}
  Name: ${t.name}
  Duration: ${t.duration} minutes
  List Position: ${t.sortOrder + 1}`;
  }).join("\n\n");

  // Build calendar events section (only for the plan date)
  const calendarSection = calendarEvents.length > 0
    ? calendarEvents.map((e) => {
        const start = e.start.dateTime ?? e.start.date ?? "";
        const end = e.end.dateTime ?? e.end.date ?? "";
        return `- ${e.summary ?? "Busy"}: ${start} to ${end}`;
      }).join("\n")
    : "No calendar events scheduled";

  // Build already scheduled tasks section
  const scheduledSection = scheduledTasks.length > 0
    ? scheduledTasks.map((t) => {
        const start = format(t.scheduledStart, "HH:mm");
        return `- ${t.name}: ${start} (${t.duration} min)`;
      }).join("\n")
    : "No tasks currently scheduled";

  return `Please suggest optimal scheduling for these daily plan tasks:

PLANNING DATE: ${dateStr}
WORK HOURS: ${workHoursStart} to ${workHoursEnd}

TASKS TO SCHEDULE:
${tasksSection}

CALENDAR EVENTS ON THIS DAY:
${calendarSection}

ALREADY SCHEDULED TASKS ON THIS DAY:
${scheduledSection}

Please provide scheduling suggestions for each task, optimizing for productivity and avoiding conflicts.`;
}

function parseDailyPlanSuggestions(responseText: string): DailyPlanSuggestion[] {
  try {
    let jsonStr = responseText;

    // Handle markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in the text
    const objectMatch = jsonStr.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    if (objectMatch?.[0]) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as { suggestions?: unknown[] };

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      console.error("[scheduling] Invalid daily plan AI response structure:", parsed);
      return [];
    }

    const validSuggestions: DailyPlanSuggestion[] = [];
    for (const suggestion of parsed.suggestions) {
      const result = DailyPlanSuggestionSchema.safeParse(suggestion);
      if (result.success) {
        validSuggestions.push(result.data);
      } else {
        console.warn("[scheduling] Invalid daily plan suggestion skipped:", result.error);
      }
    }

    return validSuggestions;
  } catch (error) {
    console.error("[scheduling] Failed to parse daily plan AI response:", error, responseText);
    return [];
  }
}

interface OverdueAction {
  id: string;
  name: string;
  description: string | null;
  dueDate: Date | null;
  priority: string;
  duration: number | null;
  project: {
    id: string;
    name: string;
    outcomes: {
      id: string;
      description: string;
      dueDate: Date | null;
    }[];
  } | null;
}

interface ScheduledAction {
  id: string;
  name: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  duration: number | null;
}

function buildSchedulingPrompt(
  overdueActions: OverdueAction[],
  calendarEvents: CalendarEvent[],
  scheduledActions: ScheduledAction[],
  days: number
): string {
  const now = new Date();

  // Build overdue actions section
  const overdueSection = overdueActions.map((a) => {
    const closestOutcomeDeadline = a.project?.outcomes
      .filter((o) => o.dueDate)
      .sort((x, y) => (x.dueDate?.getTime() ?? 0) - (y.dueDate?.getTime() ?? 0))[0];

    return `- ID: ${a.id}
  Name: ${a.name}
  Original Due Date: ${a.dueDate?.toISOString().split("T")[0] ?? "None"}
  Priority: ${a.priority}
  Duration: ${a.duration ?? 30} minutes
  Project: ${a.project?.name ?? "No project"}
  Closest Outcome Deadline: ${closestOutcomeDeadline?.dueDate?.toISOString().split("T")[0] ?? "None"}${closestOutcomeDeadline ? ` (${closestOutcomeDeadline.description.slice(0, 50)}...)` : ""}`;
  }).join("\n\n");

  // Build calendar events section
  const calendarSection = calendarEvents.length > 0
    ? calendarEvents.map((e) => {
        const start = e.start.dateTime ?? e.start.date ?? "";
        const end = e.end.dateTime ?? e.end.date ?? "";
        return `- ${e.summary}: ${start} to ${end}`;
      }).join("\n")
    : "No calendar events scheduled";

  // Build scheduled actions section
  const scheduledSection = scheduledActions.length > 0
    ? scheduledActions.map((a) => {
        const start = a.scheduledStart?.toISOString() ?? "";
        const duration = a.duration ?? 30;
        return `- ${a.name}: ${start} (${duration} min)`;
      }).join("\n")
    : "No actions currently scheduled";

  return `Please suggest optimal scheduling for these overdue actions:

OVERDUE ACTIONS TO RESCHEDULE:
${overdueSection}

CALENDAR EVENTS (next ${days} days):
${calendarSection}

ALREADY SCHEDULED ACTIONS:
${scheduledSection}

Current date/time: ${now.toISOString()}
Scheduling window: Next ${days} days

Please provide scheduling suggestions for each overdue action, considering outcome deadlines and avoiding conflicts.`;
}

function parseAISuggestions(responseText: string): SchedulingSuggestion[] {
  try {
    // Try to extract JSON from the response
    let jsonStr = responseText;

    // Handle markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in the text
    const objectMatch = jsonStr.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    if (objectMatch?.[0]) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as { suggestions?: unknown[] };

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      console.error("[scheduling] Invalid AI response structure:", parsed);
      return [];
    }

    // Validate each suggestion
    const validSuggestions: SchedulingSuggestion[] = [];
    for (const suggestion of parsed.suggestions) {
      const result = SchedulingSuggestionSchema.safeParse(suggestion);
      if (result.success) {
        validSuggestions.push(result.data);
      } else {
        console.warn("[scheduling] Invalid suggestion skipped:", result.error);
      }
    }

    return validSuggestions;
  } catch (error) {
    console.error("[scheduling] Failed to parse AI response:", error, responseText);
    return [];
  }
}

export const schedulingRouter = createTRPCRouter({
  getSchedulingSuggestions: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
        actionIds: z.array(z.string()).optional(),
        days: z.number().min(1).max(14).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      // Calculate end date for look-ahead window
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + input.days);

      // 1. Fetch overdue actions with projects and outcomes
      const overdueActions = await ctx.db.action.findMany({
        where: {
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId: userId } } },
          ],
          status: "ACTIVE",
          dueDate: { lt: today },
          ...(input.actionIds ? { id: { in: input.actionIds } } : {}),
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          project: {
            include: {
              outcomes: {
                where: { dueDate: { not: null } },
                orderBy: { dueDate: "asc" },
                take: 3, // Only get closest 3 outcomes
              },
            },
          },
        },
        orderBy: [
          { dueDate: "asc" }, // Oldest overdue first
        ],
        take: 20, // Limit to 20 overdue actions to avoid huge prompts
      });

      if (overdueActions.length === 0) {
        return { suggestions: [], calendarConnected: true };
      }

      // 2. Fetch calendar events for the scheduling window
      let calendarEvents: CalendarEvent[] = [];
      let calendarConnected = true;

      try {
        const calendarService = new GoogleCalendarService();
        calendarEvents = await calendarService.getEvents(userId, {
          timeMin: now,
          timeMax: endDate,
          maxResults: 100,
        });
      } catch (error) {
        console.warn("[scheduling] Calendar not connected or error fetching events:", error);
        calendarConnected = false;
        // Continue without calendar - suggestions will be less optimal but still useful
      }

      // 3. Fetch already scheduled actions for the scheduling window
      const scheduledActions = await ctx.db.action.findMany({
        where: {
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId: userId } } },
          ],
          scheduledStart: {
            gte: now,
            lte: endDate,
          },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          scheduledStart: true,
          scheduledEnd: true,
          duration: true,
        },
        orderBy: { scheduledStart: "asc" },
      });

      // 4. Build the prompt and call Mastra agent
      const userPrompt = buildSchedulingPrompt(
        overdueActions,
        calendarEvents,
        scheduledActions,
        input.days
      );

      if (!MASTRA_API_URL) {
        console.error("[scheduling] MASTRA_API_URL not configured");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI scheduling service not configured",
        });
      }

      try {
        const agentJWT = generateAgentJWT(ctx.session.user, 30);

        const response = await fetch(
          `${MASTRA_API_URL}/api/agents/ashagent/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                { role: "system", content: SCHEDULING_SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
              ],
              runtimeContext: {
                authToken: agentJWT,
                userId: userId,
                userEmail: ctx.session.user.email,
                todoAppBaseUrl: process.env.TODO_APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[scheduling] Mastra API error (${response.status}):`, errorText);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to get AI scheduling suggestions",
          });
        }

        const responseData = await response.json() as { text?: string; content?: string };
        const responseText = responseData.text ?? responseData.content ?? JSON.stringify(responseData);

        const suggestions = parseAISuggestions(responseText);

        // Filter suggestions to only include valid action IDs
        const validActionIds = new Set(overdueActions.map((a) => a.id));
        const validSuggestions = suggestions.filter((s) => validActionIds.has(s.actionId));

        return {
          suggestions: validSuggestions,
          calendarConnected,
          overdueCount: overdueActions.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        console.error("[scheduling] Error calling Mastra agent:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate scheduling suggestions",
        });
      }
    }),

  // Auto-schedule a single task
  autoScheduleTask: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const calendarService = new GoogleCalendarService();
      const schedulingService = new AutoSchedulingService(
        ctx.db,
        calendarService
      );

      const result = await schedulingService.scheduleTask(input.actionId, userId);

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Could not schedule task - no available slots or task not found",
        });
      }

      return result;
    }),

  // Reschedule all auto-scheduled tasks
  rescheduleAll: protectedProcedure
    .input(z.object({ workspaceId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const calendarService = new GoogleCalendarService();
      const schedulingService = new AutoSchedulingService(
        ctx.db,
        calendarService
      );

      const result = await schedulingService.rescheduleAll(
        userId,
        input.workspaceId
      );

      return result;
    }),

  // Calculate ETA for a task
  calculateETA: protectedProcedure
    .input(
      z.object({
        scheduledDate: z.date().nullable(),
        deadline: z.date().nullable(),
      })
    )
    .query(({ ctx, input }) => {
      const schedulingService = new AutoSchedulingService(ctx.db);
      return schedulingService.calculateETA(input.scheduledDate, input.deadline);
    }),

  // Update ETAs for all tasks
  updateAllETAs: protectedProcedure
    .input(z.object({ workspaceId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const schedulingService = new AutoSchedulingService(ctx.db);

      await schedulingService.updateAllETAs(userId, input.workspaceId);

      return { success: true };
    }),

  // Check for deadline conflicts
  checkDeadlineConflicts: protectedProcedure
    .input(z.object({ workspaceId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const schedulingService = new AutoSchedulingService(ctx.db);

      const conflicts = await schedulingService.checkDeadlineConflicts(
        userId,
        input.workspaceId
      );

      return { conflicts };
    }),

  /**
   * Get scheduling suggestions for DailyPlanAction items
   * Uses Mastra AI agent for intelligent scheduling suggestions
   */
  getSuggestionsForDailyPlan: protectedProcedure
    .input(
      z.object({
        dailyPlanId: z.string(),
        timezoneOffset: z.number().optional(), // Minutes from UTC (from getTimezoneOffset())
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Fetch the daily plan with all tasks (unscheduled and scheduled)
      const dailyPlan = await ctx.db.dailyPlan.findFirst({
        where: { id: input.dailyPlanId, userId },
        include: {
          plannedActions: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!dailyPlan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Daily plan not found",
        });
      }

      // Separate unscheduled and scheduled tasks
      const unscheduledTasks = dailyPlan.plannedActions.filter(t => !t.scheduledStart);
      const scheduledTasks = dailyPlan.plannedActions.filter(t => t.scheduledStart);

      console.log("[getSuggestionsForDailyPlan] Daily plan:", dailyPlan.id, "Total tasks:", dailyPlan.plannedActions.length, "Unscheduled:", unscheduledTasks.length, "Scheduled:", scheduledTasks.length);

      if (unscheduledTasks.length === 0) {
        console.log("[getSuggestionsForDailyPlan] No unscheduled tasks found");
        return { suggestions: [], calendarConnected: true };
      }

      // Don't apply startOfDay() - dailyPlan.date is already midnight in user's timezone
      const planDate = dailyPlan.date;
      const planDateEnd = new Date(planDate);
      planDateEnd.setHours(23, 59, 59, 999);

      console.log("[scheduling.getSuggestionsForDailyPlan] dailyPlan.date:", dailyPlan.date.toISOString(), "→ planDate:", planDate.toISOString());

      // Get user's work hours
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { workHoursStart: true, workHoursEnd: true },
      });
      const workHoursStart = user?.workHoursStart ?? "09:00";
      const workHoursEnd = user?.workHoursEnd ?? "17:00";

      // Fetch calendar events for the plan date
      let calendarEvents: CalendarEvent[] = [];
      let calendarConnected = true;

      try {
        const calendarService = new GoogleCalendarService();
        calendarEvents = await calendarService.getEvents(userId, {
          timeMin: planDate,
          timeMax: planDateEnd,
          maxResults: 50,
        });
      } catch {
        calendarConnected = false;
      }

      // Build prompt for AI
      const tasksForPrompt: DailyPlanTask[] = unscheduledTasks.map(t => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        sortOrder: t.sortOrder,
      }));

      const scheduledForPrompt = scheduledTasks
        .filter(t => t.scheduledStart)
        .map(t => ({
          id: t.id,
          name: t.name,
          scheduledStart: t.scheduledStart!,
          scheduledEnd: t.scheduledEnd,
          duration: t.duration,
        }));

      const userPrompt = buildDailyPlanSchedulingPrompt(
        tasksForPrompt,
        calendarEvents,
        scheduledForPrompt,
        planDate,
        workHoursStart,
        workHoursEnd
      );

      // Try AI-powered scheduling first
      if (MASTRA_API_URL) {
        try {
          const agentJWT = generateAgentJWT(ctx.session.user, 30);

          const response = await fetch(
            `${MASTRA_API_URL}/api/agents/ashagent/generate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  { role: "system", content: DAILY_PLAN_SCHEDULING_PROMPT },
                  { role: "user", content: userPrompt },
                ],
                runtimeContext: {
                  authToken: agentJWT,
                  userId: userId,
                  userEmail: ctx.session.user.email,
                  todoAppBaseUrl: process.env.TODO_APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
                },
              }),
            }
          );

          if (response.ok) {
            const responseData = await response.json() as { text?: string; content?: string };
            const responseText = responseData.text ?? responseData.content ?? JSON.stringify(responseData);

            const aiSuggestions = parseDailyPlanSuggestions(responseText);

            // Convert AI suggestions to the expected format
            const validTaskIds = new Set(unscheduledTasks.map(t => t.id));
            const suggestions = aiSuggestions
              .filter(s => validTaskIds.has(s.taskId))
              .map((s, index) => {
                const task = unscheduledTasks.find(t => t.id === s.taskId);
                if (!task) return null;

                // Parse suggested time and create Date objects in user's timezone
                const [hours, minutes] = s.suggestedTime.split(":").map(Number);
                const suggestedStart = input.timezoneOffset !== undefined
                  ? setTimeInUserTimezone(planDate, hours ?? 9, minutes ?? 0, input.timezoneOffset)
                  : (() => {
                      const d = new Date(planDate);
                      d.setHours(hours ?? 9, minutes ?? 0, 0, 0);
                      return d;
                    })();

                console.log("[scheduling] AI suggestion - hours:", hours, "minutes:", minutes, "→ suggestedStart:", suggestedStart.toISOString());

                const duration = s.duration ?? task.duration;
                const suggestedEnd = addMinutes(suggestedStart, duration);

                return {
                  taskId: s.taskId,
                  taskName: task.name,
                  duration,
                  suggestedStart,
                  suggestedEnd,
                  reasoning: s.reasoning + (s.conflictWarning ? ` ⚠️ ${s.conflictWarning}` : ""),
                  score: 100 - index, // Higher score for earlier suggestions
                };
              })
              .filter((s): s is NonNullable<typeof s> => s !== null);

            if (suggestions.length > 0) {
              return {
                suggestions,
                calendarConnected,
                planDate: format(planDate, "yyyy-MM-dd"),
              };
            }
          } else {
            console.warn("[scheduling] Mastra API error, falling back to rule-based:", await response.text());
          }
        } catch (error) {
          console.warn("[scheduling] Error calling Mastra agent, falling back to rule-based:", error);
        }
      }

      // Fallback: Simple rule-based scheduling for the plan date
      // Note: We don't use AutoSchedulingService here because it respects work days,
      // but the user is explicitly planning for this specific date
      console.log("[getSuggestionsForDailyPlan] Falling back to simple rule-based scheduling");

      const suggestions: Array<{
        taskId: string;
        taskName: string;
        duration: number;
        suggestedStart: Date;
        suggestedEnd: Date;
        reasoning: string;
        score: number;
      }> = [];

      // Parse work hours
      const [startHour, startMin] = workHoursStart.split(":").map(Number);
      const [endHour] = workHoursEnd.split(":").map(Number);

      // Start from work hours start time (in user's timezone if offset provided)
      let currentTime = input.timezoneOffset !== undefined
        ? setTimeInUserTimezone(planDate, startHour ?? 9, startMin ?? 0, input.timezoneOffset)
        : (() => {
            const d = new Date(planDate);
            d.setHours(startHour ?? 9, startMin ?? 0, 0, 0);
            return d;
          })();

      console.log("[scheduling] Rule-based - startHour:", startHour, "startMin:", startMin, "→ currentTime:", currentTime.toISOString());

      // If it's today and current time is past work start, start from now (rounded to next 15 min)
      const now = new Date();
      // Check if plan date is today by comparing year, month, day
      // Use UTC date comparison since planDate is stored in user's timezone midnight
      const planDateLocal = new Date(dailyPlan.date);
      const isToday = planDateLocal.getUTCFullYear() === now.getUTCFullYear() &&
                      planDateLocal.getUTCMonth() === now.getUTCMonth() &&
                      planDateLocal.getUTCDate() === now.getUTCDate();

      if (isToday && now > currentTime) {
        currentTime = new Date(now);
        const mins = currentTime.getMinutes();
        if (mins % 15 !== 0) {
          currentTime.setMinutes(mins + (15 - (mins % 15)));
        }
        currentTime.setSeconds(0, 0);
      }

      for (const task of unscheduledTasks) {
        const suggestedStart = new Date(currentTime);
        const suggestedEnd = addMinutes(suggestedStart, task.duration);

        // Check if this slot fits within work hours
        if (suggestedEnd.getHours() > (endHour ?? 17) ||
            (suggestedEnd.getHours() === (endHour ?? 17) && suggestedEnd.getMinutes() > 0)) {
          // Task doesn't fit in remaining work hours, skip
          console.log("[getSuggestionsForDailyPlan] Task:", task.name, "doesn't fit in work hours, skipping");
          continue;
        }

        const hour = suggestedStart.getHours();
        let reasoning = "";

        if (hour >= 9 && hour < 12) {
          reasoning = "Morning slot - optimal for focused work";
        } else if (hour >= 12 && hour < 14) {
          reasoning = "Midday slot - good for moderate-focus tasks";
        } else if (hour >= 14 && hour < 17) {
          reasoning = "Afternoon slot - available time in your schedule";
        } else {
          reasoning = "Available time slot in your schedule";
        }

        if (task.duration <= 30) {
          reasoning += ". Quick task fits well in this gap.";
        } else if (task.duration >= 60) {
          reasoning += `. ${task.duration} minute block reserved.`;
        }

        suggestions.push({
          taskId: task.id,
          taskName: task.name,
          duration: task.duration,
          suggestedStart,
          suggestedEnd,
          reasoning,
          score: 100 - suggestions.length,
        });

        // Move current time forward for next task (add 15 min buffer)
        currentTime = addMinutes(suggestedEnd, 15);
      }

      suggestions.sort((a, b) => b.score - a.score);

      return {
        suggestions,
        calendarConnected,
        planDate: format(planDate, "yyyy-MM-dd"),
      };
    }),

  /**
   * Apply scheduling suggestions to DailyPlanAction items
   * Updates scheduledStart, scheduledEnd, and marks as auto-suggested
   */
  applySuggestions: protectedProcedure
    .input(
      z.object({
        suggestions: z.array(
          z.object({
            taskId: z.string(),
            scheduledStart: z.date(),
            scheduledEnd: z.date(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

      for (const suggestion of input.suggestions) {
        try {
          // Verify ownership through the daily plan
          const task = await ctx.db.dailyPlanAction.findFirst({
            where: { id: suggestion.taskId },
            include: { dailyPlan: true, action: true },
          });

          if (!task || task.dailyPlan.userId !== userId) {
            results.push({
              taskId: suggestion.taskId,
              success: false,
              error: "Task not found or access denied",
            });
            continue;
          }

          const dailyPlanUpdate = ctx.db.dailyPlanAction.update({
            where: { id: suggestion.taskId },
            data: {
              scheduledStart: suggestion.scheduledStart,
              scheduledEnd: suggestion.scheduledEnd,
              schedulingMethod: "auto-suggested",
            },
          });

          if (task.actionId && task.action) {
            await ctx.db.$transaction([
              ctx.db.action.update({
                where: { id: task.actionId },
                data: {
                  scheduledStart: suggestion.scheduledStart,
                  scheduledEnd: suggestion.scheduledEnd,
                  duration: task.duration,
                  isAutoScheduled: true,
                },
              }),
              dailyPlanUpdate,
            ]);
          } else {
            await dailyPlanUpdate;
          }

          results.push({ taskId: suggestion.taskId, success: true });
        } catch (error) {
          results.push({
            taskId: suggestion.taskId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      const applied = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);

      return { applied, failed };
    }),
});
