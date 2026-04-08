# AI Scheduling Suggestions

## Overview

The AI Scheduling Suggestions feature automatically analyzes overdue tasks and suggests optimal times to reschedule them. It considers your calendar availability, existing scheduled tasks, and project outcome deadlines to provide intelligent scheduling recommendations.

## How It Works

When you have overdue tasks and view the "Today" filter on the Act page, the system:

1. **Analyzes Your Schedule**: Fetches your Google Calendar events and already-scheduled actions for the next 7 days
2. **Considers Priorities**: Examines each overdue task's priority level and linked project outcomes
3. **Generates Suggestions**: Uses AI to recommend optimal times for each overdue task
4. **Displays Inline**: Shows suggestions directly on each overdue task card

## Features

### Intelligent Prioritization

Tasks are prioritized based on:

- **Outcome Deadlines**: Tasks linked to outcomes with closer deadlines are prioritized
- **Task Priority**: Higher priority tasks (Big Rock, Focus) get morning slots
- **Calendar Conflicts**: Avoids scheduling over existing commitments

### Visual Indicators

The overdue section shows:
- **"AI analyzing..."** badge - While suggestions are being generated
- **"X AI suggestions"** badge - When suggestions are ready
- Per-task suggestions appear inline below each overdue action

### Suggestion Details

Each suggestion includes:
- **Suggested Date & Time**: The recommended slot for the task
- **Reasoning**: Hover to see why this time was suggested
- **Priority Indicator**: Color-coded (red=high, yellow=medium, green=low)
- **Conflict Warnings**: If there are nearby events

## Using the Feature

### Prerequisites

1. **Google Calendar Connected**: For best results, connect your Google Calendar in Settings
2. **Overdue Tasks**: You need tasks with due dates in the past
3. **Today View**: Navigate to the "Today" filter on the Act page

### Accepting Suggestions

1. Review the suggested time shown on each overdue task
2. Hover over the suggestion to see the reasoning
3. Click **Apply** to schedule the task at the suggested time
4. The task's due date and scheduled start time will be updated

### Dismissing Suggestions

If a suggestion doesn't work for you:
1. Click **Dismiss** on the suggestion
2. The suggestion will be hidden for this session
3. The task remains in your overdue list for manual scheduling

## API Reference

### Endpoint

```
GET /api/trpc/scheduling.getSchedulingSuggestions
```

### Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| workspaceId | string | No | - | Filter to specific workspace |
| actionIds | string[] | No | - | Specific actions to get suggestions for |
| days | number | No | 7 | Look-ahead window (1-14 days) |

### Response

```typescript
{
  suggestions: Array<{
    actionId: string;           // ID of the overdue action
    suggestedDate: string;      // "YYYY-MM-DD" format
    suggestedTime: string;      // "HH:MM" format
    duration: number;           // Suggested duration in minutes
    reasoning: string;          // Why this time was chosen
    priority: "high" | "medium" | "low";
    conflictWarning?: string;   // Warning about nearby events
  }>;
  calendarConnected: boolean;   // Whether Google Calendar is connected
}
```

### Example Response

```json
{
  "suggestions": [
    {
      "actionId": "clx123abc",
      "suggestedDate": "2024-01-17",
      "suggestedTime": "09:00",
      "duration": 60,
      "reasoning": "High priority task linked to Q1 Report deadline. Morning slot available.",
      "priority": "high"
    },
    {
      "actionId": "clx456def",
      "suggestedDate": "2024-01-17",
      "suggestedTime": "14:00",
      "duration": 30,
      "reasoning": "Quick task, scheduled after your 1pm meeting.",
      "priority": "medium",
      "conflictWarning": "15 min before your 3pm call"
    }
  ],
  "calendarConnected": true
}
```

## Technical Details

### Data Sources

The AI considers:

1. **Overdue Actions**: Tasks with `dueDate < today` and `status = ACTIVE`
2. **Calendar Events**: From Google Calendar API (if connected)
3. **Scheduled Actions**: Existing tasks with `scheduledStart` set
4. **Project Outcomes**: Deadlines from linked project outcomes

### AI Processing

The feature uses the Mastra AI agent with a specialized prompt that:

- Prioritizes tasks by outcome deadlines
- Avoids scheduling conflicts
- Considers work patterns (morning for focused work)
- Provides clear reasoning for each suggestion

### Caching

- Suggestions are cached for 5 minutes (client-side)
- Calendar events use 15-minute cache (server-side)
- Dismissed suggestions persist for the browser session

## Troubleshooting

### No Suggestions Appearing

1. **Check for overdue tasks**: Ensure you have tasks with past due dates
2. **View Today filter**: Suggestions only appear in the "Today" view
3. **Wait for AI**: Initial analysis may take a few seconds

### Suggestions Not Accurate

1. **Connect Google Calendar**: Without calendar access, suggestions may conflict with your events
2. **Check outcome deadlines**: Ensure important tasks are linked to outcomes with deadlines
3. **Review task priorities**: Update task priorities for better suggestions

### Calendar Not Considered

1. Go to Settings → Integrations → Google Calendar
2. Click "Connect Google Calendar"
3. Grant calendar read permissions
4. Refresh the Act page

## Privacy & Data

- Calendar data is only used for scheduling analysis
- No calendar data is stored permanently
- AI suggestions are generated on-demand and not persisted
- Only you can see your scheduling suggestions

## Related Features

- [Google Calendar Integration](./GOOGLE_CALENDAR.md)
- [Task Management](./USER_GUIDE.md)
- [Project Outcomes](./OUTCOMES.md)
