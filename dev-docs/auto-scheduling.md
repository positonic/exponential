# Auto-Scheduling System

## Overview

The auto-scheduling system provides Motion-like intelligent task scheduling that automatically finds optimal time slots for tasks based on deadlines, priorities, calendar availability, and custom work schedules.

## Architecture

### Database Schema

#### Action Model Extensions

The Action model has been extended with the following fields for auto-scheduling:

```prisma
// Auto-scheduling control
isAutoScheduled       Boolean   @default(true)    // Enable/disable auto-scheduling
isHardDeadline        Boolean   @default(false)   // May schedule outside work hours
scheduleId            String?                     // Custom schedule reference
idealStartTime        String?                     // Preferred time (e.g., "09:00")

// ETA & Progress tracking
etaDaysOffset         Int?                        // Days ahead (+) or behind (-) schedule
etaStatus             String?                     // "on_track" | "at_risk" | "overdue"
timeSpentMins         Int       @default(0)       // Time already spent

// Task chunking (for long tasks)
chunkDurationMins     Int?                        // Max chunk size (default: 60)
parentChunkId         String?                     // Link to parent if this is a chunk
chunkNumber           Int?                        // Which chunk (1, 2, 3...)
totalChunks           Int?                        // Total chunks for parent

// Task dependencies
blockedByIds          String[]                    // Tasks that must complete first
blockingIds           String[]                    // Tasks this blocks

// Reminder tasks (not time-blocked)
isReminderOnly        Boolean   @default(false)
```

#### TaskSchedule Model

Custom work schedules for different contexts (work, gym, deep work):

```prisma
model TaskSchedule {
  id              String   @id @default(cuid())
  name            String                           // "Work Hours", "Gym"
  isDefault       Boolean  @default(false)
  startTime       String                           // "09:00"
  endTime         String                           // "17:00"
  daysOfWeek      Int[]                            // [1,2,3,4,5] = Mon-Fri (0=Sun)
  workspaceId     String
  createdById     String
}
```

#### RecurringTask Model

Parent definitions for recurring tasks (Phase 2 foundation):

```prisma
model RecurringTask {
  id                String   @id @default(cuid())
  name              String
  description       String?
  priority          String   @default("Medium")
  duration          Int      @default(30)
  repeatPattern     String                         // "daily" | "weekly" | "monthly"
  repeatDays        Int[]                          // [1,3,5] = Mon, Wed, Fri
  repeatInterval    Int      @default(1)
  scheduleId        String?
  idealStartTime    String?
  startDate         DateTime
  endDate           DateTime?
}
```

### Services

#### AutoSchedulingService

Location: `src/server/services/AutoSchedulingService.ts`

Core service that handles all scheduling logic:

**Key Methods:**

1. `calculateETA(scheduledDate, deadline)` → `{ daysOffset, status }`
   - Returns how many days ahead/behind schedule
   - Status: "on_track" (>1 day), "at_risk" (0-1 day), "overdue" (<0 days)

2. `getScheduleConfig(scheduleId, userId)` → `TaskScheduleConfig`
   - Returns the work schedule (start/end time, days of week)
   - Falls back to default 9-5 Mon-Fri if no custom schedule

3. `findAvailableSlots(userId, duration, deadline, schedule, idealStartTime, isHardDeadline)` → `TimeSlot[]`
   - Finds available time slots considering:
     - Google Calendar events
     - Already scheduled tasks
     - Work schedule constraints
     - Priority scoring (morning = higher score for focus work)

4. `scheduleTask(actionId, userId)` → `SchedulingResult`
   - Main entry point for scheduling a single task
   - Checks if task needs chunking (duration > chunkDurationMins)
   - Updates task with scheduledStart, scheduledEnd, ETA fields

5. `scheduleChunkedTask(action, userId, schedule, chunkDuration)` → `SchedulingResult`
   - Splits long tasks into multiple chunks
   - Creates child Action records for each chunk
   - Links chunks via parentChunkId

6. `rescheduleAll(userId, workspaceId)` → `{ scheduled, failed }`
   - Re-runs scheduling for all auto-scheduled tasks
   - Clears existing schedules first
   - Processes tasks in priority order

7. `updateAllETAs(userId, workspaceId)`
   - Batch updates ETA fields for all scheduled tasks

8. `checkDeadlineConflicts(userId, workspaceId)` → `ConflictInfo[]`
   - Returns tasks that are at risk of missing deadlines

**Priority Weights:**

```typescript
const PRIORITY_WEIGHTS = {
  "1st Priority": 100,
  "Big Rock": 100,
  "ASAP": 100,
  "2nd Priority": 80,
  "Focus": 80,
  "High": 80,
  "3rd Priority": 60,
  "Scheduled": 50,
  "Medium": 50,
  "4th Priority": 40,
  "Quick": 30,
  "5th Priority": 20,
  "Low": 20,
  "Errand": 10,
  "Remember": 5,
  "Watch": 5,
  "Someday Maybe": 1,
};
```

### API Endpoints

Location: `src/server/api/routers/scheduling.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `scheduling.autoScheduleTask` | mutation | Schedule a single task by ID |
| `scheduling.rescheduleAll` | mutation | Re-schedule all tasks in workspace |
| `scheduling.calculateETA` | query | Calculate ETA for given dates |
| `scheduling.updateAllETAs` | mutation | Batch update all ETAs |
| `scheduling.checkDeadlineConflicts` | query | Get at-risk tasks |
| `scheduling.getSchedulingSuggestions` | query | AI-powered suggestions for overdue tasks |

Location: `src/server/api/routers/taskSchedule.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `taskSchedule.list` | query | List schedules for workspace |
| `taskSchedule.getById` | query | Get schedule by ID |
| `taskSchedule.create` | mutation | Create new schedule |
| `taskSchedule.update` | mutation | Update schedule |
| `taskSchedule.delete` | mutation | Delete schedule |
| `taskSchedule.setDefault` | mutation | Set default schedule |
| `taskSchedule.getDefault` | query | Get workspace default |

### Frontend Components

#### ActionItem.tsx

Displays auto-scheduled tasks with:
- **ETA Badge**: Shows "X days ahead" (green), "at risk" (yellow), or "X days overdue" (red)
- **Auto Badge**: Shows robot icon with "Auto" when task was auto-scheduled
- **Scheduled Time Badge**: Shows the scheduled start time

#### ActionModalForm.tsx

Task form includes auto-scheduling options:
- **Auto-schedule toggle**: Enable/disable auto-scheduling
- **Hard deadline switch**: Allow scheduling outside work hours
- **Work schedule selector**: Choose custom schedule

## Usage Flow

### Creating an Auto-Scheduled Task

1. User creates task with:
   - Name, description
   - Due date (deadline)
   - Duration (estimated time)
   - `isAutoScheduled: true` (default)

2. System automatically schedules when:
   - Task is created with deadline + duration
   - `scheduling.autoScheduleTask` is called
   - `scheduling.rescheduleAll` is triggered

3. Scheduling algorithm:
   - Gets user's calendar events
   - Gets already scheduled tasks
   - Finds available slots within work hours
   - Scores slots (morning better for high priority)
   - Assigns best slot
   - Calculates and stores ETA

### Task Chunking

For tasks longer than `chunkDurationMins` (default 60 min):

1. Task is split into N chunks of max duration
2. Parent task gets first chunk's schedule
3. Child Action records created for remaining chunks
4. All chunks linked via `parentChunkId`

### ETA Tracking

ETAs are calculated as:
```typescript
daysOffset = differenceInDays(deadline, scheduledDate)

status = daysOffset > 1 ? "on_track"
       : daysOffset >= 0 ? "at_risk"
       : "overdue"
```

## Testing the Auto-Scheduling Feature

### Manual Testing via tRPC

1. Create a task with a deadline and duration
2. Call the auto-schedule mutation:
   ```typescript
   // In browser console or via tRPC client
   await trpc.scheduling.autoScheduleTask.mutate({ actionId: "your-action-id" });
   ```
3. View the task in the UI - should show:
   - "Auto" badge with robot icon (violet color)
   - ETA badge showing days ahead/behind schedule
   - Scheduled time on the task card

### Verification Checklist

- [ ] Task with deadline + duration gets scheduled
- [ ] Calendar events are avoided
- [ ] Work hours (9-5 Mon-Fri by default) are respected
- [ ] High priority tasks get morning slots
- [ ] Long tasks (>60 min) are chunked
- [ ] ETA badge shows correct status

## Future Phases

- **Phase 2**: Recurring tasks with parent/instance model
- **Phase 3**: Project templates with stages
- **Phase 4**: Ghost tasks and predictive planning
- **Phase 5**: Time tracking, template library, analytics

## Related GitHub Issues

- [#75](https://github.com/positonic/exponential/issues/75) - Phase 1: Core Auto-Scheduling Engine
- [#76](https://github.com/positonic/exponential/issues/76) - Phase 2: Recurring Tasks & Dependencies
- [#77](https://github.com/positonic/exponential/issues/77) - Phase 3: Templates & Stages
- [#78](https://github.com/positonic/exponential/issues/78) - Phase 4: Predictive Planning & Ghost Tasks
- [#79](https://github.com/positonic/exponential/issues/79) - Phase 5: Advanced Features
- [#80](https://github.com/positonic/exponential/issues/80) - Epic: Motion-like Intelligent Task Management
