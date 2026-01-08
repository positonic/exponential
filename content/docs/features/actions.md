---
title: Actions & Tasks
description: Manage your tasks with flexible priorities, due dates, and project organization
---

## Overview

Actions are the individual tasks that make up your daily work. Exponential provides flexible task management with smart prioritization, due dates, and seamless project integration.

### Key Capabilities

- **Flexible priorities**: 11 priority levels for nuanced task ordering
- **Due date tracking**: Schedule tasks with overdue detection
- **Project linking**: Associate tasks with projects
- **Kanban boards**: Visual task management per project
- **External sync**: Import from Notion, create via API
- **Team assignment**: Assign tasks to team members

## Creating Actions

### Quick Creation

1. Click the **+** button in the header or press the keyboard shortcut
2. Enter the action name
3. Optionally set due date and project
4. Press Enter or click **Create**

### Detailed Creation

1. Click **New Action** from the Actions page
2. Fill in details:
   - **Name**: Clear description of the task
   - **Description**: Additional context
   - **Due Date**: When it needs to be done
   - **Priority**: Importance level
   - **Project**: Associated project (optional)

## Priority System

Actions use an 11-level priority system:

| Priority | Use Case |
|----------|----------|
| 1st Priority | Most critical, do first |
| 2nd Priority | High importance |
| 3rd Priority | Important |
| 4th Priority | Above normal |
| 5th Priority | Normal importance |
| Quick | Fast tasks, under 5 minutes |
| Scheduled | Calendar-dependent tasks |
| Errand | Location-dependent tasks |
| Remember | Reference items |
| Watch | Items to monitor |
| Someday Maybe | Future possibilities |

## Views

### Inbox

Actions without a project. Use the inbox to:
- Capture quick thoughts
- Process unorganized tasks
- Review and assign to projects

### Today

Tasks due today with automatic overdue grouping:
- **Today's Tasks**: Due today, ready to work
- **Overdue**: Past due date, needs attention

Bulk operations available:
- Reschedule overdue items
- Delete completed tasks
- Move to tomorrow

### Upcoming

Future tasks organized by timeframe:
- Tomorrow
- This Week
- This Month

### Project View

All tasks for a specific project displayed on a Kanban board:

| Column | Status |
|--------|--------|
| Backlog | `BACKLOG` |
| To Do | `TODO` |
| In Progress | `IN_PROGRESS` |
| In Review | `IN_REVIEW` |
| Done | `DONE` |
| Cancelled | `CANCELLED` |

Drag and drop to change status and reorder within columns.

## Action Sources

Actions can be created from multiple sources:

| Source | Description |
|--------|-------------|
| `app` | Created in Exponential web/mobile |
| `ios-shortcut` | Created via iOS Shortcuts integration |
| `notion` | Synced from Notion database |
| `api` | Created via API or browser extension |
| `transcription` | Extracted from meeting transcriptions |

## External Integration

### Notion Sync

When a project has Notion sync configured:
1. Actions sync bidirectionally
2. Status and priority map between systems
3. Sync indicators show current state

Sync Status Indicators:
- **Synced**: Successfully synced with Notion
- **Failed**: Sync error occurred
- **Deleted Remotely**: Removed from Notion

### Quick Create API

Create actions programmatically:
- iOS Shortcuts integration
- Browser extension
- External automation tools

The API supports natural language:
```
Review marketing proposal for Acme project tomorrow
```

Automatically extracts:
- Task name
- Due date
- Project (if mentioned)

## Team Assignment

For team projects, assign actions to members:

1. Open the action
2. Click **Assign**
3. Select team member(s)
4. Save changes

Assignment features:
- Multiple assignees per action
- "From [Creator]" badge for assigned tasks
- Assignee avatars on task cards

## Bulk Operations

Select multiple actions for batch operations:

- **Delete**: Remove selected actions
- **Reschedule**: Move to a new date
- **Change Project**: Reassign to different project

Available in Inbox, Today, and Upcoming views.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd + Enter` | Quick create action |
| `Enter` | Complete action (when selected) |
| `Delete` | Delete action (when selected) |

## Completion Tracking

When an action is completed:
- Status changes to `COMPLETED`
- `completedAt` timestamp recorded
- Moves to Done column in Kanban
- Removed from active views

Revert completion by unchecking the task checkbox.

## Best Practices

### Daily Processing

1. Check **Today** view each morning
2. Process **Inbox** items
3. Review **Overdue** and reschedule or complete
4. Work through priorities in order

### Project Organization

- Keep Inbox empty by assigning projects
- Use Kanban for project execution
- Review project progress weekly

### Priority Management

- Reserve 1st-5th Priority for truly important items
- Use Quick for small tasks
- Put uncertain items in Someday Maybe

### Due Date Strategy

- Only set due dates for actual deadlines
- Use Today view for daily planning
- Batch reschedule overdue items weekly
