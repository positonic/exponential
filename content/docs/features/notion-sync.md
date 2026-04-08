---
title: Notion Sync & Kanban Mapping
description: Sync tasks from Notion databases and map status values to Exponential kanban columns
---

## Overview

Exponential can sync tasks from your Notion databases and display them on a kanban board. The **Status Mapping** feature lets you control exactly how your Notion status values correspond to kanban columns — so your Exponential board mirrors your Notion board.

Without a mapping, synced tasks use smart defaults (e.g. "In Progress" maps to the In Progress column). With a mapping, you have full control — even if your Notion board uses custom status names like "Shipped", "Waiting on Review", or "Triage".

## Setting Up Notion Sync

Notion sync is configured **per project** — each project can connect to a different Notion database with its own status mapping.

### Prerequisites

- A connected Notion workspace (connect via your workspace settings)
- A Notion database shared with the Exponential integration
- A project in Exponential to sync tasks into

### Setup Wizard

1. Open your project and click the **Integrations** tab
2. Find **Notion Tasks Sync** and click **Setup Integration**
3. Walk through the wizard steps:

| Step | What You Do |
|------|-------------|
| **Account** | Pick your connected Notion workspace |
| **Database** | Choose which Notion database to sync |
| **Status Mapping** | Map Notion statuses to kanban columns |
| **Sync Settings** | Set direction and frequency |

4. Click **Save Configuration**
5. Run a sync — your tasks appear in the correct kanban columns

## Configuring Status Mapping

### Step 1: Select the Status Property

After choosing your Notion database, the wizard shows all **Status** and **Select** type properties from that database. Pick the one that holds your task status (usually called "Status").

> If your database has no status or select properties, this step is skipped and the default mapping applies automatically.

### Step 2: Map Each Value

For each option in your Notion status property, choose which Exponential kanban column it maps to:

| Exponential Column | Typical Notion Values |
|---|---|
| **Backlog** | Not Started, Backlog, Icebox, Later |
| **To Do** | To Do, To-do, Open, New |
| **In Progress** | In Progress, Doing, Active |
| **In Review** | In Review, Review |
| **Done** | Done, Completed, Finished |
| **Cancelled** | Cancelled, Archived, Won't Do |

### Step 3: Use Auto-Detect

Click the **Auto-detect** button to let Exponential guess the mapping based on common status names. It handles most standard naming conventions. You can then adjust any values that don't match your setup.

## Sync Direction

Choose how tasks flow between Notion and Exponential:

| Direction | Behavior |
|-----------|----------|
| **Pull** (recommended) | Notion is the source of truth. Tasks flow from Notion into Exponential. |
| **Push** | Exponential is the source of truth. Tasks flow from Exponential into Notion. |
| **Bidirectional** | Changes sync both ways. Experimental — most recently edited version wins on conflict. |

## Sync Frequency

| Frequency | Behavior |
|-----------|----------|
| **Manual** | Sync only when you click "Sync Now" |
| **Hourly** | Automatically sync every hour |
| **Daily** | Automatically sync once per day |

## How the Mapping Works

### Default Mapping

If no custom mapping is configured, Exponential uses fuzzy matching on your Notion status names:

| Notion Status | Kanban Column |
|---|---|
| Done, Completed, Complete, Finished | **Done** |
| In Progress, Doing, Active | **In Progress** |
| In Review, Review | **In Review** |
| Todo, To Do, To-do, Open, New | **To Do** |
| Not Started, Backlog, Icebox | **Backlog** |
| Cancelled, Canceled, Archived | **Cancelled** |

Any unrecognized status defaults to **To Do**.

### Supported Notion Property Types

The mapping works with three types of Notion properties:

- **Status** — Native Notion status with groups (To-do, In progress, Complete)
- **Select** — Single-select dropdown
- **Checkbox** — Checked = Done, unchecked = Not Started

### What Gets Set on Each Task

When a task syncs from Notion, Exponential automatically sets:

- **Kanban column** — Based on your mapping
- **Position** — Appended to the end of the column
- **Completion** — Tasks in the Done column are marked complete with a timestamp

When a task's Notion status changes and re-syncs, it moves to the new column automatically.

### Mapping Inheritance

Status mappings follow a three-level hierarchy:

1. **Project-level** (highest priority) — Set in the setup wizard for a specific project
2. **Workspace-level** — Default mappings shared across all projects
3. **App defaults** — Built-in fuzzy matching described above

## Examples

### Standard Notion Board

Your Notion database has a "Status" property with: Not started, In progress, Done.

Auto-detect handles this perfectly — no manual configuration needed.

### Custom Workflow

Your Notion database has a "Stage" select property with custom values:

| Notion "Stage" | Exponential Column |
|---|---|
| Triage | Backlog |
| Spec | To Do |
| Building | In Progress |
| QA | In Review |
| Shipped | Done |
| Wont Fix | Cancelled |

Select "Stage" as the status property, then map each value manually.

### Simple Checkbox

Your Notion database uses a checkbox for completion. No mapping step needed — checked items go to Done, unchecked go to Backlog by default.

## Troubleshooting

### Tasks don't appear on the kanban board

- Ensure the project has a Notion sync configured with a status mapping
- Run a manual sync after configuring the mapping
- Tasks synced **before** the mapping was configured won't retroactively get a kanban column — re-sync to update them

### Tasks appear in the wrong column

- Go to your project's **Integrations** tab and click **Configure Notion** to review the mapping
- Make sure you selected the correct status property (some databases have multiple select properties)
- Click Auto-detect to reset, then adjust

### No status properties shown in the wizard

- The Notion database may not have any Status or Select type properties
- Check that the Exponential integration has access to the database in Notion (the database must be explicitly shared with the integration)

### Auto-detect maps incorrectly

Auto-detect uses English name matching. If your Notion statuses are in another language or use unusual names, configure the mapping manually.

## Next Steps

- [Learn about Projects](/docs/features/projects)
- [Explore Workflows](/docs/features/workflows)
- [View all Integrations](/docs/features/integrations)
