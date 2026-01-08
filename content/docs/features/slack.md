---
title: Slack Integration
description: Connect Exponential to Slack for team notifications and AI-powered project management
---

## Overview

The Slack integration enables:

- Meeting summaries and action items sent to channels
- Chat with Paddy (AI assistant) directly in Slack
- Create and manage tasks via slash commands
- Smart channel routing per project or team

## Quick Setup

### Step 1: Install the Slack App

1. Go to **Integrations** in your Exponential dashboard
2. Click **Add Slack Integration**
3. Authorize the app in your Slack workspace

### Step 2: Invite the Bot

Invite @Exponential to channels where you want notifications:

```
/invite @Exponential
```

### Step 3: Configure Project Channels (Optional)

1. Go to **Project Settings**
2. Select **Slack Channel**
3. Choose the channel for project notifications

## Using Slack Commands

### Slash Commands

| Command | Description |
|---------|-------------|
| `/paddy <question>` | Chat with Paddy AI |
| `/expo create <task>` | Create a new action |
| `/expo list` | List your actions |
| `/expo projects` | List your projects |
| `/expo help` | Show available commands |

### Examples

```
/paddy What was discussed in yesterday's standup?

/expo create Review the API documentation

/expo list
```

### Natural Conversations

You can also chat naturally with Paddy:

- **DM the bot** for private conversations
- **@Exponential** in channels for team discussions
- **Reply in threads** for contextual follow-ups

#### Example Conversation

```
You: @Exponential What should I prioritize today?

Paddy: Based on your current projects, here are your high-priority items:
       - Complete user research analysis (Project: Product Launch)
       - Review staging environment (Project: API Upgrade)
       - Prepare client presentation (Project: Q3 Sales)

You: Create a task to follow up on the API integration

Paddy: Created action: "Follow up on the API integration"
       Added to your Exponential inbox
```

## Meeting Notifications

When paired with [Fireflies Integration](/docs/features/fireflies), Slack receives automatic meeting notifications.

### Notification Content

- Meeting title and summary
- Key discussion points
- Extracted action items with priorities
- Interactive buttons to view details

### Notification Format

```
New Action Items from Meeting

Meeting: Weekly Standup with Team

Action Items:
- Review API security audit (High)
- Deploy staging environment (Medium)
- Prepare client presentation (Normal)

[View All Actions] [Create Action]
```

## Channel Routing

Notifications are routed based on your configuration:

| Priority | Configuration | Use Case |
|----------|--------------|----------|
| 1st | Project Channel | Project-specific updates |
| 2nd | Team Channel | Team-wide notifications |
| 3rd | User Default | Personal integration fallback |

### Configuring Project Channels

1. Open your project in Exponential
2. Go to **Project Settings**
3. Under **Notifications**, select **Slack Channel**
4. Choose the target channel from the dropdown

The bot must be invited to the channel before it can send notifications.

## Features

### Meeting Transcriptions

Paddy can access and search through your meeting transcriptions:

```
You: What was the meeting with the design team about?

Paddy: I found a meeting with the design team from Tuesday. Here are the key points:
       - Discussed new dashboard layout
       - Reviewed user feedback on navigation
       - Action items: Update mockups, Schedule user testing
```

### Project Management

Full project and task management capabilities:

```
You: Show me my active projects

Paddy: Here are your active projects:
       - API Integration (High Priority) - 3 tasks
       - User Research (Medium Priority) - 1 task
       - Q3 Planning (Low Priority) - 5 tasks
```

### Smart Responses

Paddy provides contextual, intelligent responses including:

- Meeting queries with summaries
- Task management and prioritization
- Project progress updates
- Goal tracking and alignment
- Decision history recall

## Troubleshooting

### Bot Not Responding

- Ensure the bot is invited to the channel (`/invite @Exponential`)
- Check that your Slack email matches your Exponential account
- Try a simple command: `/expo help`

### Missing Notifications

- Verify the project has a Slack channel configured
- Check that the bot has permission to post in the channel
- Ensure your Fireflies integration is active (for meeting notifications)

### Authentication Issues

- Your Slack email must match your Exponential account
- Contact your team admin if you're not automatically mapped
- Try reconnecting the integration from the Integrations page

### Generic Responses

If Paddy gives generic responses instead of accessing your data:

- Verify your team membership in Exponential
- Check that the integration is properly linked to your team
- Try disconnecting and reconnecting the Slack app

## Security

- **Request verification** - All requests verified with cryptographic signatures
- **Team-scoped access** - Users can only access their team's data
- **Permission inheritance** - Same permissions as web application
- **Secure tokens** - Token management with automatic expiration

## User Mapping

The integration automatically maps Slack users to Exponential accounts based on:

1. Matching email addresses
2. Matching usernames
3. Manual mapping by team admins

If automatic mapping fails, contact your team admin to set up manual mapping in the Exponential dashboard.
