---
title: Teams
description: Collaborate with others on projects and share integrations
---

## Overview

Teams let you work together with colleagues on shared projects. Unlike workspaces (which are containers for your data), teams are groups of people who collaborate together.

## Teams vs Workspaces

| Feature | Teams | Workspaces |
|---------|-------|------------|
| **Purpose** | Group people together | Organize and isolate data |
| **Contains** | Members, projects, integrations | Projects, goals, actions, plugins |
| **Sharing** | Share projects across members | Invite members to access data |
| **Use case** | "Marketing team works on these projects" | "Client X data lives here" |

**Tip:** You can link teams to workspaces to organize how people collaborate on workspace content.

## Accessing Teams

Navigate to **Teams** in the sidebar to see all teams you're a member of.

## Creating a Team

1. Navigate to **Teams** in the sidebar
2. Click **Create Team**
3. Enter team details:
   - **Team Name** - Display name (e.g., "Marketing Team")
   - **Slug** - URL identifier (auto-generated from name)
   - **Description** - What the team works on
4. Click **Create Team**

You become the team owner automatically.

### Team Slug Format

The slug appears in URLs and can only contain:
- Lowercase letters
- Numbers
- Hyphens

Example: "Marketing Team" becomes `marketing-team`

## Team Roles

Teams have three member roles:

| Role | Permissions |
|------|-------------|
| **Owner** | Full control, manage settings, add/remove members, delete team |
| **Admin** | Manage settings and members, access all team content |
| **Member** | Access team projects and integrations |

### Role Badges

In the team interface, roles are indicated by:
- **Owner** - Crown icon with yellow badge
- **Admin** - Shield icon with blue badge
- **Member** - User icon with gray badge

## Adding Team Members

1. Navigate to your team
2. Click the menu (three dots) on a team card, or go to Team Settings
3. Click **Add Member**
4. Enter the person's email address
5. Select a role (Admin or Member)
6. Click **Add Member**

**Note:** The person must already have an Exponential account to be added to the team.

## Team Dashboard

Each team card shows:

| Information | Description |
|-------------|-------------|
| **Team name** | Display name with owner badge if applicable |
| **Description** | Brief description of team purpose |
| **Member count** | Number of people in the team |
| **Project count** | Projects assigned to this team |
| **Integration count** | Shared integrations |
| **Member preview** | Avatars of first 5 members |

## Viewing Team Details

Click **View Team** or the team name to see:
- Full member list with roles
- Team projects
- Team integrations
- Team settings (if you're owner/admin)

## Team Projects

Projects can be assigned to teams for collaborative work.

### Assigning a Project to a Team

1. Open the project you want to share
2. Go to project settings
3. Click **Assign to Team**
4. Select the team
5. All team members will have access

### Team Project Features

When a project is assigned to a team:
- All team members can view and edit the project
- Weekly team reviews include the project
- Team-level reporting aggregates project data

## Team Integrations

Teams can share integrations like:
- Slack channels for notifications
- Shared API credentials
- Common webhooks

Team integrations appear in the team integration count on the dashboard.

## Weekly Team Reviews

Teams support weekly review workflows where members can:
- Share their weekly progress
- Review what others accomplished
- Plan upcoming work together

To access weekly reviews:
1. Go to **Teams**
2. Select your team
3. Navigate to **Members**
4. Click on a member to see their weekly review

See [Weekly Review](/docs/features/weekly-review) for more on the review process.

## Linking Teams to Workspaces

Teams can be linked to workspaces to organize collaboration:

### In Workspace Settings

1. Go to workspace **Settings**
2. Find the **Teams** section
3. See teams organized by:
   - **Linked to this workspace** - Already connected
   - **Available to link** - Your teams not yet linked
   - **Linked to other workspaces** - Used elsewhere

### Linking a Team

1. Find your team in "Available to link"
2. Click to link it (you must be the team owner)
3. Team members can now access workspace content based on their workspace roles

### Unlinking a Team

1. Find the team in "Linked to this workspace"
2. Click to unlink (you must be the team owner)

## Team Best Practices

### Team Organization

- **One team per functional group** - Marketing team, Engineering team, etc.
- **Clear naming** - Use descriptive names that indicate purpose
- **Document in descriptions** - Explain what the team works on

### Role Assignment

- **Limit owners** - Usually just the team creator
- **Use admin sparingly** - For people who need to manage the team
- **Default to member** - Most people only need content access

### Project Management

- **Assign relevant projects** - Only share what the team needs
- **Use team reviews** - Keep everyone aligned with weekly reviews
- **Share integrations** - Configure team-wide Slack channels

## Managing Your Team

### From the Teams Page

- Click the menu (three dots) on any team card
- Options include:
  - **Add Member** - Invite someone new
  - **Team Settings** - Full team management

### Team Settings Page

Access full team management by clicking **View Team** then navigating to settings:
- Edit team name and description
- Manage member roles
- Remove members
- Configure team integrations

## Common Questions

### Can I be on multiple teams?

Yes. You can be a member of as many teams as needed.

### Can a project belong to multiple teams?

No. Projects can only be assigned to one team at a time.

### What happens when I leave a team?

You lose access to team projects and integrations. Your personal data and workspace access are not affected.

### Can I create teams without a workspace?

Yes. Teams exist independently of workspaces. You can create teams first, then link them to workspaces later.

### Who can see team members?

All team members can see who else is on the team and their roles.

## Next Steps

- [Learn about Workspaces](/docs/features/workspaces)
- [Set up Weekly Reviews](/docs/features/weekly-review)
- [Create your first Project](/docs/features/projects)
