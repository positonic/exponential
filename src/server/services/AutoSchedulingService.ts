import type { PrismaClient, Action } from "@prisma/client";
import type {
  GoogleCalendarService,
  CalendarEvent,
} from "./GoogleCalendarService";
import {
  addDays,
  addMinutes,
  differenceInDays,
  isBefore,
  isAfter,
  isSameDay,
  setHours,
  setMinutes,
  startOfDay,
  parseISO,
} from "date-fns";

// Types
export interface TimeSlot {
  start: Date;
  end: Date;
  score: number; // Higher is better
}

export interface SchedulingResult {
  actionId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  etaDaysOffset: number;
  etaStatus: "on_track" | "at_risk" | "overdue";
  chunks?: ChunkInfo[];
}

export interface ChunkInfo {
  chunkNumber: number;
  totalChunks: number;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface ETAResult {
  daysOffset: number;
  status: "on_track" | "at_risk" | "overdue";
}

export interface TaskScheduleConfig {
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  daysOfWeek: number[]; // [1,2,3,4,5] = Mon-Fri
}

// Priority weights for scheduling order
const PRIORITY_WEIGHTS: Record<string, number> = {
  "1st Priority": 100,
  "Big Rock": 100,
  "2nd Priority": 80,
  Focus: 80,
  "3rd Priority": 60,
  "4th Priority": 40,
  "5th Priority": 20,
  Quick: 30,
  Scheduled: 50,
  Errand: 10,
  Remember: 5,
  Watch: 5,
  "Someday Maybe": 1,
  ASAP: 100,
  High: 80,
  Medium: 50,
  Low: 20,
};

// Default work schedule
const DEFAULT_SCHEDULE: TaskScheduleConfig = {
  startTime: "09:00",
  endTime: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
};

// Default chunk duration in minutes
const DEFAULT_CHUNK_DURATION = 60;
export class AutoSchedulingService {
  constructor(
    private db: PrismaClient,
    private calendarService?: GoogleCalendarService
  ) {}

  /**
   * Calculate ETA for a task based on scheduled date and deadline
   */
  calculateETA(scheduledDate: Date | null, deadline: Date | null): ETAResult {
    if (!deadline) {
      return { daysOffset: 0, status: "on_track" };
    }

    const effectiveScheduledDate = scheduledDate ?? new Date();
    const daysOffset = differenceInDays(deadline, effectiveScheduledDate);

    let status: "on_track" | "at_risk" | "overdue";
    if (daysOffset < 0) {
      status = "overdue";
    } else if (daysOffset <= 1) {
      status = "at_risk";
    } else {
      status = "on_track";
    }

    return { daysOffset, status };
  }

  /**
   * Get the schedule config for a task (custom or default)
   */
  async getScheduleConfig(
    scheduleId: string | null,
    userId: string
  ): Promise<TaskScheduleConfig> {
    if (scheduleId) {
      const schedule = await this.db.taskSchedule.findUnique({
        where: { id: scheduleId },
      });
      if (schedule) {
        return {
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          daysOfWeek: schedule.daysOfWeek,
        };
      }
    }

    // Check user's work hours preferences
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        workHoursEnabled: true,
        workDaysJson: true,
        workHoursStart: true,
        workHoursEnd: true,
      },
    });

    if (user?.workHoursEnabled && user.workHoursStart && user.workHoursEnd) {
      const workDays = user.workDaysJson
        ? (JSON.parse(user.workDaysJson) as string[])
        : ["monday", "tuesday", "wednesday", "thursday", "friday"];

      const dayMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };

      return {
        startTime: user.workHoursStart,
        endTime: user.workHoursEnd,
        daysOfWeek: workDays.map((d) => dayMap[d.toLowerCase()] ?? 1),
      };
    }

    return DEFAULT_SCHEDULE;
  }

  /**
   * Parse time string "HH:MM" to hours and minutes
   */
  private parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return { hours: hours ?? 9, minutes: minutes ?? 0 };
  }

  /**
   * Check if a date falls within the schedule's working days
   */
  private isWorkingDay(date: Date, schedule: TaskScheduleConfig): boolean {
    const dayOfWeek = date.getDay();
    return schedule.daysOfWeek.includes(dayOfWeek);
  }

  /**
   * Get working time range for a specific date
   */
  private getWorkingTimeRange(
    date: Date,
    schedule: TaskScheduleConfig
  ): { start: Date; end: Date } | null {
    if (!this.isWorkingDay(date, schedule)) {
      return null;
    }

    const startTime = this.parseTime(schedule.startTime);
    const endTime = this.parseTime(schedule.endTime);

    const start = setMinutes(
      setHours(startOfDay(date), startTime.hours),
      startTime.minutes
    );
    const end = setMinutes(
      setHours(startOfDay(date), endTime.hours),
      endTime.minutes
    );

    return { start, end };
  }

  /**
   * Find available time slots for a given duration
   */
  async findAvailableSlots(
    userId: string,
    durationMins: number,
    deadline: Date | null,
    schedule: TaskScheduleConfig,
    idealStartTime?: string | null,
    isHardDeadline = false
  ): Promise<TimeSlot[]> {
    const now = new Date();
    const maxDate = deadline
      ? addDays(deadline, isHardDeadline ? 0 : 7) // Hard deadline: must finish by deadline
      : addDays(now, 30); // Default: look 30 days ahead

    const slots: TimeSlot[] = [];

    // Get calendar events
    let calendarEvents: CalendarEvent[] = [];
    if (this.calendarService) {
      try {
        calendarEvents = await this.calendarService.getEvents(userId, {
          timeMin: now,
          timeMax: maxDate,
          maxResults: 200,
        });
      } catch {
        // Calendar not connected, continue without
      }
    }

    // Get already scheduled actions
    const scheduledActions = await this.db.action.findMany({
      where: {
        OR: [
          { createdById: userId, assignees: { none: {} } },
          { assignees: { some: { userId } } },
        ],
        scheduledStart: { gte: now, lte: maxDate },
        status: "ACTIVE",
        isAutoScheduled: true,
      },
      select: {
        id: true,
        scheduledStart: true,
        scheduledEnd: true,
        duration: true,
      },
    });

    // Build list of busy periods
    const busyPeriods: Array<{ start: Date; end: Date }> = [];

    // Add calendar events
    for (const event of calendarEvents) {
      const start = event.start.dateTime
        ? parseISO(event.start.dateTime)
        : event.start.date
          ? parseISO(event.start.date)
          : null;
      const end = event.end.dateTime
        ? parseISO(event.end.dateTime)
        : event.end.date
          ? parseISO(event.end.date)
          : null;

      if (start && end) {
        busyPeriods.push({ start, end });
      }
    }

    // Add scheduled actions
    for (const action of scheduledActions) {
      if (action.scheduledStart) {
        const end =
          action.scheduledEnd ??
          addMinutes(action.scheduledStart, action.duration ?? 30);
        busyPeriods.push({ start: action.scheduledStart, end });
      }
    }

    // Sort busy periods
    busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Scan through days and find available slots
    let currentDate = now;
    const idealTime = idealStartTime ? this.parseTime(idealStartTime) : null;

    while (isBefore(currentDate, maxDate) && slots.length < 20) {
      const workRange = this.getWorkingTimeRange(currentDate, schedule);

      if (workRange) {
        // Start from now if it's today, otherwise from work start
        let slotStart = isSameDay(currentDate, now)
          ? new Date(Math.max(now.getTime(), workRange.start.getTime()))
          : workRange.start;

        // Round up to next 15-minute mark
        const mins = slotStart.getMinutes();
        if (mins % 15 !== 0) {
          slotStart = addMinutes(slotStart, 15 - (mins % 15));
        }

        while (isBefore(slotStart, workRange.end)) {
          const slotEnd = addMinutes(slotStart, durationMins);

          // Check if slot fits within work hours
          if (isAfter(slotEnd, workRange.end)) {
            break;
          }

          // Check for conflicts with busy periods
          const hasConflict = busyPeriods.some(
            (busy) =>
              (isBefore(slotStart, busy.end) && isAfter(slotEnd, busy.start)) ||
              (slotStart >= busy.start && slotStart < busy.end)
          );

          if (!hasConflict) {
            // Calculate score
            let score = 100;

            // Prefer ideal start time
            if (idealTime) {
              const slotHour = slotStart.getHours();
              const slotMin = slotStart.getMinutes();
              const diffMins = Math.abs(
                slotHour * 60 + slotMin - (idealTime.hours * 60 + idealTime.minutes)
              );
              score -= diffMins / 2; // Reduce score by distance from ideal
            }

            // Prefer morning slots for high-priority work
            const hour = slotStart.getHours();
            if (hour >= 9 && hour < 12) {
              score += 20; // Morning bonus
            }

            // Penalize slots far from deadline
            if (deadline) {
              const daysFromDeadline = differenceInDays(deadline, slotStart);
              if (daysFromDeadline < 0) {
                score -= 50; // Past deadline
              } else if (daysFromDeadline === 0) {
                score += 10; // Same day as deadline
              }
            }

            slots.push({ start: slotStart, end: slotEnd, score });
          }

          // Move to next 15-minute slot
          slotStart = addMinutes(slotStart, 15);
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    // Sort by score (highest first)
    slots.sort((a, b) => b.score - a.score);

    return slots;
  }

  /**
   * Schedule a single task
   */
  async scheduleTask(
    actionId: string,
    userId: string
  ): Promise<SchedulingResult | null> {
    const action = await this.db.action.findUnique({
      where: { id: actionId },
      include: {
        schedule: true,
      },
    });

    if (!action) {
      return null;
    }

    // Skip if not auto-scheduled or already has manual schedule
    if (!action.isAutoScheduled) {
      return null;
    }

    // Skip reminder tasks
    if (action.isReminderOnly) {
      return null;
    }

    const duration = action.duration ?? 30;
    const schedule = await this.getScheduleConfig(action.scheduleId, userId);

    // Find available slots
    const slots = await this.findAvailableSlots(
      userId,
      duration,
      action.dueDate,
      schedule,
      action.idealStartTime,
      action.isHardDeadline
    );

    if (slots.length === 0) {
      // No slots available - update ETA to reflect this
      const eta = this.calculateETA(null, action.dueDate);
      await this.db.action.update({
        where: { id: actionId },
        data: {
          etaDaysOffset: eta.daysOffset,
          etaStatus: eta.status,
        },
      });
      return null;
    }

    const bestSlot = slots[0];
    if (!bestSlot) {
      return null;
    }

    const eta = this.calculateETA(bestSlot.start, action.dueDate);

    // Check if task needs chunking
    const chunkDuration = action.chunkDurationMins ?? DEFAULT_CHUNK_DURATION;
    if (duration > chunkDuration) {
      return this.scheduleChunkedTask(action, userId, schedule, chunkDuration);
    }

    // Update the action with scheduled time
    await this.db.action.update({
      where: { id: actionId },
      data: {
        scheduledStart: bestSlot.start,
        scheduledEnd: bestSlot.end,
        etaDaysOffset: eta.daysOffset,
        etaStatus: eta.status,
      },
    });

    return {
      actionId,
      scheduledStart: bestSlot.start,
      scheduledEnd: bestSlot.end,
      etaDaysOffset: eta.daysOffset,
      etaStatus: eta.status,
    };
  }

  /**
   * Schedule a task that needs to be broken into chunks
   */
  private async scheduleChunkedTask(
    action: Action,
    userId: string,
    schedule: TaskScheduleConfig,
    chunkDurationMins: number
  ): Promise<SchedulingResult | null> {
    const totalDuration = action.duration ?? 60;
    const remainingDuration = totalDuration - (action.timeSpentMins ?? 0);
    const numChunks = Math.ceil(remainingDuration / chunkDurationMins);

    const chunks: ChunkInfo[] = [];
    let lastScheduledEnd = new Date();

    for (let i = 0; i < numChunks; i++) {
      const isLastChunk = i === numChunks - 1;
      const chunkDuration = isLastChunk
        ? remainingDuration - i * chunkDurationMins
        : chunkDurationMins;

      // Find slot for this chunk (starting after last chunk)
      const slots = await this.findAvailableSlots(
        userId,
        chunkDuration,
        action.dueDate,
        schedule,
        action.idealStartTime,
        action.isHardDeadline
      );

      // Filter to slots after the last scheduled chunk
      const validSlots = slots.filter((s) => isAfter(s.start, lastScheduledEnd));

      if (validSlots.length === 0) {
        break; // Can't schedule remaining chunks
      }

      const slot = validSlots[0];
      if (!slot) break;

      chunks.push({
        chunkNumber: i + 1,
        totalChunks: numChunks,
        scheduledStart: slot.start,
        scheduledEnd: slot.end,
      });

      lastScheduledEnd = slot.end;
    }

    if (chunks.length === 0) {
      return null;
    }

    // Update parent action with first chunk's schedule
    const firstChunk = chunks[0];
    if (!firstChunk) return null;

    const eta = this.calculateETA(firstChunk.scheduledStart, action.dueDate);

    await this.db.action.update({
      where: { id: action.id },
      data: {
        scheduledStart: firstChunk.scheduledStart,
        scheduledEnd: firstChunk.scheduledEnd,
        etaDaysOffset: eta.daysOffset,
        etaStatus: eta.status,
        totalChunks: numChunks,
        chunkNumber: 1,
        chunkDurationMins: chunkDurationMins,
      },
    });

    // Create child chunk actions for remaining chunks
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      await this.db.action.create({
        data: {
          name: `${action.name} (${chunk.chunkNumber}/${chunk.totalChunks})`,
          description: action.description,
          priority: action.priority,
          duration: chunkDurationMins,
          scheduledStart: chunk.scheduledStart,
          scheduledEnd: chunk.scheduledEnd,
          status: "ACTIVE",
          createdById: userId,
          projectId: action.projectId,
          workspaceId: action.workspaceId,
          isAutoScheduled: true,
          parentChunkId: action.id,
          chunkNumber: chunk.chunkNumber,
          totalChunks: chunk.totalChunks,
          etaDaysOffset: eta.daysOffset,
          etaStatus: eta.status,
        },
      });
    }

    return {
      actionId: action.id,
      scheduledStart: firstChunk.scheduledStart,
      scheduledEnd: firstChunk.scheduledEnd,
      etaDaysOffset: eta.daysOffset,
      etaStatus: eta.status,
      chunks,
    };
  }

  /**
   * Reschedule all auto-scheduled tasks for a user
   */
  async rescheduleAll(
    userId: string,
    workspaceId?: string
  ): Promise<{ scheduled: number; failed: number }> {
    // Get all tasks that need scheduling
    const actions = await this.db.action.findMany({
      where: {
        OR: [
          { createdById: userId, assignees: { none: {} } },
          { assignees: { some: { userId } } },
        ],
        status: "ACTIVE",
        isAutoScheduled: true,
        isReminderOnly: false,
        parentChunkId: null, // Don't reschedule child chunks
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: [
        { dueDate: "asc" }, // Closest deadline first
        { priority: "asc" }, // Then by priority
      ],
    });

    // Sort by priority weight
    const sortedActions = [...actions].sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority] ?? 10;
      const weightB = PRIORITY_WEIGHTS[b.priority] ?? 10;
      return weightB - weightA; // Higher weight first
    });

    // Clear existing auto-scheduled times
    await this.db.action.updateMany({
      where: {
        id: { in: sortedActions.map((a) => a.id) },
      },
      data: {
        scheduledStart: null,
        scheduledEnd: null,
      },
    });

    // Delete existing child chunks
    await this.db.action.deleteMany({
      where: {
        parentChunkId: { in: sortedActions.map((a) => a.id) },
      },
    });

    let scheduled = 0;
    let failed = 0;

    // Schedule each task
    for (const action of sortedActions) {
      const result = await this.scheduleTask(action.id, userId);
      if (result) {
        scheduled++;
      } else {
        failed++;
      }
    }

    return { scheduled, failed };
  }

  /**
   * Update ETA for all tasks
   */
  async updateAllETAs(userId: string, workspaceId?: string): Promise<void> {
    const actions = await this.db.action.findMany({
      where: {
        OR: [
          { createdById: userId, assignees: { none: {} } },
          { assignees: { some: { userId } } },
        ],
        status: "ACTIVE",
        dueDate: { not: null },
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    for (const action of actions) {
      const eta = this.calculateETA(action.scheduledStart, action.dueDate);

      if (
        action.etaDaysOffset !== eta.daysOffset ||
        action.etaStatus !== eta.status
      ) {
        await this.db.action.update({
          where: { id: action.id },
          data: {
            etaDaysOffset: eta.daysOffset,
            etaStatus: eta.status,
          },
        });
      }
    }
  }

  /**
   * Check for deadline conflicts and return at-risk tasks
   */
  async checkDeadlineConflicts(
    userId: string,
    workspaceId?: string
  ): Promise<
    Array<{
      actionId: string;
      actionName: string;
      deadline: Date;
      scheduledDate: Date | null;
      status: "at_risk" | "overdue";
    }>
  > {
    const actions = await this.db.action.findMany({
      where: {
        OR: [
          { createdById: userId, assignees: { none: {} } },
          { assignees: { some: { userId } } },
        ],
        status: "ACTIVE",
        dueDate: { not: null },
        etaStatus: { in: ["at_risk", "overdue"] },
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: {
        id: true,
        name: true,
        dueDate: true,
        scheduledStart: true,
        etaStatus: true,
      },
    });

    return actions
      .filter((a) => a.dueDate && a.etaStatus)
      .map((a) => ({
        actionId: a.id,
        actionName: a.name,
        deadline: a.dueDate!,
        scheduledDate: a.scheduledStart,
        status: a.etaStatus as "at_risk" | "overdue",
      }));
  }
}
