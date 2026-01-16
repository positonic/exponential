import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { GoogleCalendarService, type CalendarEvent } from "~/server/services/GoogleCalendarService";
import { generateAgentJWT } from "~/server/utils/jwt";

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
});
