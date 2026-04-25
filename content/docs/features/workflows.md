---
title: Workflows
description: Automate your productivity with connected tools and guided processes
---

## Overview

The Workflows page helps you automate repetitive tasks by connecting external services and following structured processes. You can capture data from meetings automatically, sync tasks with your favorite tools, and use guided workflows to achieve specific goals.

## Accessing Workflows

Navigate to **Workflows** in the sidebar to see all available automation options.

## Automated Workflows

### How Data Flows

Automated workflows follow a three-step pattern:

```
Data Sources → AI Processing → Task Management
```

1. **Data Sources** - Capture information from meetings, browser, or Slack
2. **AI Processing** - Exponential extracts and organizes action items
3. **Task Management** - Actions sync to your preferred tool (Notion or Monday.com)

### Data Input Sources

These integrations send data INTO Exponential:

#### Fireflies Meeting Transcription
- **Status:** Setup Required
- **What it does:** Automatically captures meeting transcripts and extracts action items
- **Setup:** Requires webhook token and API key
- [Full setup guide](/docs/features/fireflies)

#### Browser Extension Capture
- **Status:** Active
- **What it does:** Capture actions and notes while browsing any website
- **No setup required** - Install the browser extension to get started

#### Slack Message Actions
- **Status:** Available
- **What it does:** Create action items directly from Slack messages
- [Full setup guide](/docs/features/slack)

### Task Management Sync

Choose ONE of these to sync your actions:

#### Notion Tasks Database
- **Status:** Available
- **What it does:** Bidirectional sync with Notion databases
- Keep your Notion workspace and Exponential in sync
- Configure sync strategy, conflict resolution, and deletion behavior

#### Monday.com Boards
- **Status:** Available
- **What it does:** Push action items to Monday.com boards
- Ideal for teams already using Monday.com for project management

**Important:** You can only sync with one task management system at a time to avoid conflicts.

### Document Integration (Coming Soon)

#### Google Docs Meeting Summaries
- Automatically create meeting summaries and action plans

#### Document Context Import
- Import meeting notes and context from Notion pages and Google Docs for AI assistance

## Guided Processes

Guided processes are structured workflows that help you achieve specific goals.

### Launch Sprint

A tailored 3-week plan to validate your idea, launch your MVP, or grow your existing product.

**Ideal for:** Startups, indie hackers, product managers

**What you'll get:**
- Week-by-week action plan
- Validation milestones
- Launch checklist

### Elevator Pitch

Craft a compelling elevator pitch using a structured template focused on customer needs and your unique value proposition.

**Ideal for:** Entrepreneurs, founders, sales teams

**What you'll get:**
- Problem statement framework
- Value proposition template
- Pitch refinement exercises

## Setting Up Fireflies Integration

Fireflies is the most powerful integration for automatic action capture.

### Step 1: Generate a Webhook Token

1. On the Workflows page, find **Fireflies Meeting Transcription**
2. Click **Setup**
3. Enter a token name (e.g., "Fireflies Webhook Token")
4. Choose an expiration period (90 days recommended)
5. Click **Generate Token**
6. **Copy the token immediately** - you won't see it again

### Step 2: Create the Integration

1. After generating the token, click **Setup** again
2. Enter your Fireflies API key (from your Fireflies account settings)
3. Click **Create Integration**

### Step 3: Configure Fireflies Webhook

1. Log into Fireflies.ai
2. Go to Settings > Integrations
3. Add a new webhook with your Exponential webhook URL
4. Paste your token for authentication

Once configured, meeting transcripts will automatically flow into Exponential and action items will be extracted.

## Workflow Status Indicators

Each workflow shows its current status:

| Status | Color | Meaning |
|--------|-------|---------|
| **Active** | Green | Fully configured and working |
| **Available** | Blue | Ready to set up |
| **Setup Required** | Orange | Partially configured, needs attention |
| **Coming Soon** | Gray | Not yet available |

## Best Practices

### Start with Data Sources

Configure data input sources first:
1. Set up Fireflies for meeting capture
2. Install the browser extension
3. Connect Slack if your team uses it

### Add Task Sync Later

Once you have data flowing in:
1. Review your captured actions
2. Choose Notion OR Monday.com based on your team's preference
3. Configure sync settings carefully

### Review Regularly

- Check the Workflows page weekly to ensure integrations are active
- Monitor for any setup issues or expired tokens
- Update tokens before they expire

## Common Questions

### Can I use both Notion and Monday.com?

No. To prevent conflicts and duplicate data, you can only sync with one task management system at a time.

### How often do integrations sync?

- **Fireflies:** Real-time via webhooks (instant)
- **Notion/Monday.com:** Depends on your sync strategy (manual or automatic)
- **Slack:** Real-time when actions are created

### What happens if my token expires?

Webhooks will stop working until you generate a new token. The Workflows page will show "Setup Required" status for affected integrations.

## Next Steps

- [Set up Fireflies integration](/docs/features/fireflies)
- [Configure Slack notifications](/docs/features/slack)
- [Learn about API tokens](/docs/features/api-access)
