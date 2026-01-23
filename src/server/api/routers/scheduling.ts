import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { GoogleCalendarService, type CalendarEvent } from "~/server/services/GoogleCalendarService";
import { AutoSchedulingService } from "~/server/services/AutoSchedulingService";
import { generateAgentJWT } from "~/server/utils/jwt";
import { addMinutes, format, isSameDay, startOfDay } from "date-fns";

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
   * Uses AutoSchedulingService to find optimal time slots
   */
  getSuggestionsForDailyPlan: protectedProcedure
    .input(
      z.object({
        dailyPlanId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Fetch the daily plan with unscheduled tasks
      const dailyPlan = await ctx.db.dailyPlan.findFirst({
        where: { id: input.dailyPlanId, userId },
        include: {
          plannedActions: {
            where: {
              scheduledStart: null, // Only unscheduled tasks
            },
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

      if (dailyPlan.plannedActions.length === 0) {
        return { suggestions: [], calendarConnected: true };
      }

      // Initialize services
      let calendarService: GoogleCalendarService | undefined;
      let calendarConnected = true;
      try {
        calendarService = new GoogleCalendarService();
        // Test if calendar is connected by making a small query
        await calendarService.getEvents(userId, {
          timeMin: new Date(),
          timeMax: addMinutes(new Date(), 1),
          maxResults: 1,
        });
      } catch {
        calendarConnected = false;
        calendarService = undefined;
      }

      const schedulingService = new AutoSchedulingService(ctx.db, calendarService);
      const schedule = await schedulingService.getScheduleConfig(null, userId);
      const planDate = startOfDay(dailyPlan.date);

      // Generate suggestions for each unscheduled task
      const suggestions: Array<{
        taskId: string;
        taskName: string;
        duration: number;
        suggestedStart: Date;
        suggestedEnd: Date;
        reasoning: string;
        score: number;
      }> = [];

      for (const task of dailyPlan.plannedActions) {
        // Find available slots for this task on the plan date
        const slots = await schedulingService.findAvailableSlots(
          userId,
          task.duration,
          null, // No deadline for daily plan tasks
          schedule,
          null, // No ideal start time
          false // Not a hard deadline
        );

        // Filter slots to only include those on the plan date
        const todaySlots = slots.filter((slot) => isSameDay(slot.start, planDate));

        if (todaySlots.length > 0) {
          const bestSlot = todaySlots[0];
          if (bestSlot) {
            // Generate reasoning based on slot characteristics
            const hour = bestSlot.start.getHours();
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

            // Add context about duration fit
            if (task.duration <= 30) {
              reasoning += ". Quick task fits well in this gap.";
            } else if (task.duration >= 60) {
              reasoning += `. ${task.duration} minute block reserved.`;
            }

            suggestions.push({
              taskId: task.id,
              taskName: task.name,
              duration: task.duration,
              suggestedStart: bestSlot.start,
              suggestedEnd: bestSlot.end,
              reasoning,
              score: bestSlot.score,
            });
          }
        }
      }

      // Sort by score (best suggestions first)
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
            include: { dailyPlan: true },
          });

          if (!task || task.dailyPlan.userId !== userId) {
            results.push({
              taskId: suggestion.taskId,
              success: false,
              error: "Task not found or access denied",
            });
            continue;
          }

          // Update the task with scheduling info
          await ctx.db.dailyPlanAction.update({
            where: { id: suggestion.taskId },
            data: {
              scheduledStart: suggestion.scheduledStart,
              scheduledEnd: suggestion.scheduledEnd,
              schedulingMethod: "auto-suggested",
            },
          });

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
