# Daily Productivity Scoring System

## Overview

A gamification system that scores users 0-100 each day based on their planning and execution habits. The system rewards **consistency over perfection** - users can earn 60-80 points just by showing up and engaging with the daily planning workflow.

## Scoring Rubric (0-100 points)

### Planning Consistency (40 points) - Highest Weight

| Component | Points | Trigger |
|-----------|--------|---------|
| Daily Plan Created | 20 | `DailyPlan` record created for the day |
| Daily Plan Completed | 20 | `DailyPlan.status` set to `"COMPLETED"` |

### Task Execution (25 points)

Formula: `(completedTasks / totalPlannedTasks) * 25`

- 5/5 tasks = 25 points
- 4/5 tasks = 20 points
- 3/5 tasks = 15 points
- 0 planned tasks = 0 points (no penalty)

### Habit Completion (20 points)

Formula: `(completedHabits / scheduledHabits) * 20`

- Only counts habits scheduled for that specific day of the week
- 0 scheduled habits = 0 points (no penalty)

### Bonus Points (15 points total)

| Bonus | Points | Condition |
|-------|--------|-----------|
| AI Scheduling | 5 | Used AI-suggested scheduling and completed tasks |
| Inbox Processing | 5 | Processed overdue tasks (`processedOverdue` flag) |
| Estimation Accuracy | 5 | Time estimates within 20% of actual (`estimationAccuracy >= 80`) |

### Weekly Review Bonus (up to +10 points)

When a weekly review is completed, **+1.43 points** are distributed to each of the 7 days in that review's week. This retroactively boosts scores and rewards the weekly reflection habit.

## Streak System

### Qualified Day

A score of **60 or more** qualifies for streak counting. This threshold ensures even low-energy days count - creating a plan and completing a few tasks is enough.

### Streak Types

Three independent streaks are tracked:

1. **Daily Planning** - Consecutive qualified days
2. **Habits** - Uses existing habit streak logic
3. **Weekly Review** - Uses existing weekly review streak logic

### Badge Levels

| Streak | Badge | Emoji |
|--------|-------|-------|
| 1-2 days | Starting | (green) |
| 3-6 days | On Fire | (orange) |
| 7-13 days | Weekly Warrior | (blue) |
| 14-29 days | Fortnight Champion | (violet) |
| 30-89 days | Monthly Master | (yellow) |
| 90+ days | Productivity Legend | (red) |

## Architecture

### Database Models

Three new Prisma models in `prisma/schema.prisma`:

- **`DailyScore`** - Stores daily scores with full breakdown (plan, tasks, habits, bonuses). Unique on `[userId, workspaceId, date]`.
- **`ProductivityStreak`** - Tracks current and longest streaks per type. Unique on `[userId, workspaceId, streakType]`.
- **`LeaderboardEntry`** - Caches leaderboard rankings per period (today/week/month/all_time). Unique on `[userId, workspaceId, period]`.

Updated existing models:
- **`User`** - Added `leaderboardOptIn`, `leaderboardAnonymous`, `leaderboardWorkspaceIds`
- **`DailyPlan`** - Added `overdueTasks`, `processedOverdue`, `estimationAccuracy`, `scoreCalculated`, `scoreId`
- **`Workspace`** - Added relations to scoring models

### Service Layer

#### `src/server/services/ScoringService.ts`

| Method | Purpose |
|--------|---------|
| `calculateDailyScore(ctx, date, workspaceId?)` | Main scoring engine. Gathers all data and computes the 0-100 score. Upserts `DailyScore` record. |
| `getScoreRange(ctx, startDate, endDate, workspaceId?)` | Returns scores for a date range (used by charts). |
| `getProductivityStats(ctx, workspaceId?)` | Returns averages: today, 7-day, 30-day, and consistency percentage. |
| `updateDailyPlanningStreak(ctx, date, score, workspaceId?)` | Updates the daily planning streak if score >= 60. |
| `getScheduledHabitsForDay(db, userId, date)` | Counts habits scheduled for a specific weekday and how many were completed. |
| `applyWeeklyReviewBonus(ctx, weekStartDate, weekEndDate, workspaceId?)` | Distributes +1.43 weekly review bonus points across 7 days. |

#### `src/server/services/LeaderboardService.ts`

| Method | Purpose |
|--------|---------|
| `getLeaderboard(ctx, timeframe, workspaceId?, limit?)` | Returns ranked leaderboard entries with user details. |
| `getUserRank(ctx, timeframe, workspaceId?)` | Returns the current user's rank and entry. |
| `updatePreferences(ctx, optIn, anonymous, workspaceIds?)` | Updates user's leaderboard visibility settings. |
| `refreshLeaderboardCache(ctx, timeframe, workspaceId?)` | Recalculates rankings for a timeframe. |

### API Endpoints

#### Scoring Router (`src/server/api/routers/scoring.ts`)

| Endpoint | Type | Description |
|----------|------|-------------|
| `scoring.getTodayScore` | query | Get/calculate today's score |
| `scoring.getScoreHistory` | query | Scores for a date range |
| `scoring.getLast30Days` | query | Last 30 days (for chart) |
| `scoring.getProductivityStats` | query | Averages and consistency |
| `scoring.getStreaks` | query | All user streaks |
| `scoring.getStreakByType` | query | Specific streak (daily_planning, habits, weekly_review) |
| `scoring.recalculateScore` | mutation | Force recalculation for a date |

#### Leaderboard Router (`src/server/api/routers/leaderboard.ts`)

| Endpoint | Type | Description |
|----------|------|-------------|
| `leaderboard.getLeaderboard` | query | Ranked list for timeframe |
| `leaderboard.getMyRank` | query | Current user's rank |
| `leaderboard.getMyPreferences` | query | User's leaderboard settings |
| `leaderboard.updatePreferences` | mutation | Update opt-in/anonymous settings |
| `leaderboard.refreshCache` | mutation | Refresh leaderboard cache |

### Real-Time Scoring Hooks

Score recalculates automatically when users interact with the system:

| Router | Trigger | What Happens |
|--------|---------|--------------|
| `dailyPlan.updateTask` | Task completion toggled | Recalculates score for plan's date |
| `dailyPlan.completePlan` | Plan marked complete | Recalculates score (+20 plan completed) |
| `dailyPlan.updatePlan` | Plan status/obstacles updated | Recalculates score |
| `action.update` | Action completion changed | Finds linked daily plans, recalculates each |
| `habit.toggleCompletion` | Habit toggled | Recalculates today's score |
| `weeklyReview.markComplete` | Weekly review done | Distributes +1.43 bonus to 7 days |

All hooks use `.catch()` error handling so scoring failures never break core functionality.

### Frontend Components

All in `src/app/_components/scoring/`:

| Component | Purpose | Used In |
|-----------|---------|---------|
| `DailyScoreCard` | Main score display with compact/full modes | WelcomeStep, DoPageContent |
| `StreakBadge` | Streak count with badge level and emoji | DailyScoreCard |
| `ScoreBreakdown` | Detailed category breakdown with progress bars | DailyScoreCard (expandable) |
| `ProductivityChart` | 30-day bar chart with color coding | (Not yet integrated) |

#### DailyScoreCard Modes

- **Compact mode** (`<DailyScoreCard compact />`): Shows score circle + quick stats row. Used in daily plan wizard welcome step.
- **Full mode** (`<DailyScoreCard />`): Shows score, stats, streak badge, and expandable breakdown. Used on Today page.

#### Score Color Coding

| Score Range | Color | Meaning |
|-------------|-------|---------|
| 80-100 | Green | Excellent day |
| 60-79 | Blue | Good day (qualified) |
| 40-59 | Yellow | Partial engagement |
| 0-39 | Orange | Minimal engagement |

## Technical Notes

### Prisma Nullable Composite Unique Keys

The `DailyScore`, `ProductivityStreak`, and `LeaderboardEntry` models all have composite unique keys that include an optional `workspaceId`. Because SQL treats `NULL != NULL`, Prisma's `upsert` and `findUnique` fail when `workspaceId` is `null`.

**Solution**: All database operations use `findFirst` + `create`/`update` instead of `upsert`/`findUnique`:

```typescript
// Instead of this (BROKEN with null workspaceId):
await db.dailyScore.upsert({
  where: { userId_workspaceId_date: { userId, workspaceId: null, date } },
  ...
});

// Use this pattern (WORKS):
const existing = await db.dailyScore.findFirst({
  where: { userId, workspaceId: workspaceId ?? null, date },
});
if (existing) {
  await db.dailyScore.update({ where: { id: existing.id }, data: { ... } });
} else {
  await db.dailyScore.create({ data: { ... } });
}
```

### Score Calculation Flow

```
User action (complete task, toggle habit, etc.)
  -> tRPC mutation handler
  -> ScoringService.calculateDailyScore()
    -> Fetch DailyPlan for the date
    -> Count completed vs total planned tasks
    -> Count scheduled vs completed habits
    -> Calculate bonuses (scheduling, inbox, estimation)
    -> Sum all components (capped at 100)
    -> Upsert DailyScore record
    -> Update daily planning streak if score >= 60
  -> Return updated score to frontend
  -> React Query invalidates and refetches
```

## Example Scoring Scenarios

### "Show Up" Day (68 points)
- Create daily plan: +20
- Complete daily plan: +20
- Complete 3/5 tasks: +15
- Complete 2/3 habits: +13
- No bonuses: +0
- **Total: 68** (qualifies for streak)

### Perfect Day (100 points)
- Create daily plan: +20
- Complete daily plan: +20
- Complete 5/5 tasks: +25
- Complete 3/3 habits: +20
- AI scheduling bonus: +5
- Inbox processing bonus: +5
- Estimation accuracy bonus: +5
- **Total: 100**

### Minimal Day (40 points)
- Create daily plan: +20
- Complete daily plan: +20
- No tasks completed: +0
- No habits completed: +0
- **Total: 40** (does NOT qualify for streak)

## Remaining Work

1. **ProductivityChart integration** - Add the 30-day trend chart to a dashboard or home page
2. **Leaderboard page** - Build `/w/[workspaceSlug]/leaderboard/` with LeaderboardCard, MyStatsCard, OptInBanner components
3. **Nightly cron job** - Create `/src/app/api/cron/finalize-scores/route.ts` for score finalization at 2am (handles estimation accuracy, missed days, leaderboard refresh)
4. **End-to-end testing** - Verify all scoring scenarios work correctly in production
