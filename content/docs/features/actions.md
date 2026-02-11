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
- **Epic grouping**: Bundle related actions into larger initiatives
- **Sprint assignment**: Plan work in time-boxed sprints
- **Effort estimates**: Size your work with story points, t-shirt sizes, or hours
- **Dependencies**: Track which tasks are blocked by others
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
   - **Epic**: Group this action under a larger initiative (optional)
   - **Sprint**: Assign to a sprint for time-boxed planning (optional)
   - **Effort**: Estimate the size of this work (optional)
   - **Blockers**: Mark other actions that need to finish first (optional)

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

## Epics

Epics let you group related actions into larger initiatives. When you're working on something that involves multiple steps — like launching a feature or running a campaign — an epic keeps everything connected.

### Assigning an Epic

1. Open the **Create** or **Edit Action** modal
2. Click the **Epic** button
3. Choose an existing epic, or click **New Epic** to create one
4. The button turns purple to show the action is linked

You can change or remove the epic at any time.

[Learn more about Epics](/docs/features/epics)

## Sprint Assignment

Sprints are time-boxed periods (usually one or two weeks) where you commit to completing a set of actions. Assigning actions to sprints helps you plan your work in manageable chunks.

### Assigning to a Sprint

1. Open the **Create** or **Edit Action** modal
2. Click the **Sprint** button
3. Browse available sprints — each shows its date range
4. Select a sprint

The button turns teal to confirm the assignment. This makes it easy to see at a glance which actions are planned for the current sprint.

## Effort Estimates

Effort estimates help you understand the size of each action before you start. This is useful for planning how much you can realistically take on in a sprint or a week.

Your workspace admin chooses one of three estimation methods in **Settings**:

| Method | How It Works |
|--------|-------------|
| **Story Points** | Pick from a standard scale: 1, 2, 3, 5, 8, 13, or 21. Smaller numbers = less effort |
| **T-shirt Sizes** | Choose XS, S, M, L, or XL — a quick, intuitive way to size work |
| **Hours** | Enter a time estimate in hours (in 30-minute increments) |

### Setting an Estimate

1. Open the **Create** or **Edit Action** modal
2. Click the **Effort** button
3. Select or enter your estimate
4. Click **Clear** if you want to remove it

The estimation method is consistent across your whole workspace, so everyone is speaking the same language when sizing work.

## Dependencies

Sometimes you can't start a task until something else is finished. Dependencies let you mark these relationships so nothing falls through the cracks.

### Adding Blockers

1. Open the **Create** or **Edit Action** modal
2. Click the **Blockers** button
3. Search for the action that needs to finish first
4. Select it to add it as a blocker

You can add multiple blockers, and each one appears as a chip that you can remove individually. This gives you a clear picture of what's holding up your work and helps you prioritize accordingly.

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
