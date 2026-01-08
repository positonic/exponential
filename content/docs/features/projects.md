---
title: Projects
description: Organize your work into focused projects with priorities, statuses, and team collaboration
---

## Overview

Projects are the core organizational unit in Exponential. They help you group related work, track progress, and maintain focus on what matters most.

### Key Capabilities

- **Status tracking**: Active, On Hold, Completed, Cancelled
- **Priority levels**: High, Medium, Low, None
- **Progress monitoring**: Visual progress tracking (0-100%)
- **Team collaboration**: Assign projects to teams with member roles
- **External integrations**: Sync with Notion, Monday.com, GitHub
- **Goal alignment**: Link projects to strategic goals and outcomes

## Creating a Project

1. Navigate to **Projects** from the sidebar
2. Click **New Project**
3. Enter project details:
   - **Name**: Clear, descriptive title
   - **Description**: Context and objectives
   - **Priority**: Set importance level
   - **Status**: Typically starts as Active
4. Optionally link to goals, outcomes, or life domains
5. Click **Create**

### Project Fields

| Field | Purpose |
|-------|---------|
| Name | Project title (required) |
| Description | Context and objectives |
| Status | Lifecycle state (Active, On Hold, Completed, Cancelled) |
| Priority | Importance level (High, Medium, Low, None) |
| Progress | Completion percentage (0-100%) |
| Review Date | When to review project status |
| Next Action Date | Deadline for next step |

## Project Status Flow

Projects typically move through these states:

```
ACTIVE (default)
    ↓
ON_HOLD (paused/deprioritized)
    ↓
ACTIVE (resumed)
    ↓
COMPLETED (finished)

or

CANCELLED (no longer needed)
```

## Project Views

### Overview Tab

The project dashboard showing:
- Calendar with important dates
- Linked goals and life domains
- Connected outcomes
- Recent actions timeline

### Tasks Tab

Kanban board for managing project actions:

| Column | Purpose |
|--------|---------|
| Backlog | Ideas and future work |
| To Do | Ready to start |
| In Progress | Currently working on |
| In Review | Awaiting review |
| Done | Completed |
| Cancelled | No longer needed |

### Goals Tab

Strategic goals this project advances. Link projects to goals to maintain alignment between daily work and long-term vision.

### Outcomes Tab

Measurable results expected from this project:
- Daily outcomes
- Weekly milestones
- Monthly deliverables
- Quarterly objectives

### Timeline Tab

Visual timeline showing outcome progression and key milestones.

### Workflows Tab

Automation and integrations:
- Notion sync configuration
- Monday.com board connection
- GitHub issues pipeline

### Transcriptions Tab

Meeting recordings and transcriptions associated with this project. Automatically extracts action items from [Fireflies](/docs/features/fireflies) recordings.

## External Integrations

### Notion Sync

Bidirectional task synchronization with Notion databases:

1. Go to project **Settings**
2. Select **Notion** as task management tool
3. Configure sync options:
   - **Sync Strategy**: Manual, auto-pull, or Notion canonical
   - **Conflict Resolution**: Local wins or Notion wins
   - **Deletion Behavior**: Mark deleted or archive

### Monday.com Integration

Push actions to Monday.com boards with automatic field mapping for status and priority.

### GitHub Issues

Bidirectional sync with GitHub repositories:
- Create actions from GitHub issues
- Push project tasks to GitHub
- Automatic label and priority mapping

## Team Projects

Projects can be assigned to teams for collaborative work:

### Team Features

- **Weekly Team Review**: Team planning and alignment
- **Weekly Outcomes**: Shared team objectives
- **Member Capacity**: Track available hours per team member
- **Access Control**: Team membership grants project access

### Assigning to a Team

1. Open project **Settings**
2. Select **Assign to Team**
3. Choose the target team
4. Configure member access levels

## Workspace Organization

Projects can be organized into workspaces for better separation:

- **Personal Workspace**: Default individual projects
- **Team Workspaces**: Shared team projects
- **Organization Workspaces**: Company-wide projects

Switch workspaces using the workspace selector in the sidebar.

## Slack Notifications

Configure Slack channels for project notifications:

1. Open project **Settings**
2. Select **Slack Channel**
3. Choose the notification channel

When paired with [Fireflies](/docs/features/fireflies), meeting summaries and action items are automatically sent to the configured channel.

## Best Practices

### Project Naming

- Use clear, action-oriented names
- Include client or context if relevant
- Keep names concise but descriptive

### Status Management

- Review On Hold projects weekly
- Complete or cancel stale projects
- Use progress percentage for visibility

### Goal Alignment

- Link every project to at least one goal
- Review alignment during weekly reviews
- Adjust priorities based on goal importance

### Team Collaboration

- Assign clear owners to projects
- Set realistic review dates
- Use Slack integration for async updates
