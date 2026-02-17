---
title: Slack Integration
description: Let Exponential read, search, and manage your Slack - because staying across 47 channels shouldn't require 47 tabs
---

## What This Does

The Slack integration gives your AI assistants (Zoe, Paddy, and custom assistants) the ability to:

- **Read** channel history and catch you up
- **Search** messages across your workspace
- **Send** updates to channels and threads
- **List** your channels and unread counts

Translation: you can ask "what happened in #engineering while I was in meetings" and get an actual answer.

## Setup (5 minutes)

### 1. Create a Slack App

Head to [api.slack.com/apps](https://api.slack.com/apps) and create a new app "from scratch."

Name it whatever you want. "Exponential" works. "Productivity Daemon" works too.

### 2. Add Bot Permissions

In **OAuth & Permissions**, add these scopes:

| Scope | Why |
|-------|-----|
| `channels:history` | Read public channel messages |
| `channels:read` | List channels |
| `groups:history` | Read private channel messages |
| `groups:read` | List private channels |
| `im:history` | Read DMs (if you want that) |
| `im:read` | List DMs |
| `chat:write` | Send messages |
| `users:read` | Look up user info |
| `search:read` | Search message history |

Yes, that's a lot of permissions. The alternative is an AI that can only wave at Slack from across the room.

### 3. Install to Workspace

Click **Install to Workspace** and authorize. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

### 4. Add to Exponential

In your Mastra environment (`.env`):

```bash
SLACK_BOT_TOKEN="xoxb-your-token-here"
```

Restart the service. Done.

## What You Can Ask

Once connected, your AI assistants have full Slack awareness.

### Catch Up On Channels

```
"What happened in #engineering today?"
"Summarize #product-launch since yesterday"
"Any urgent messages in #support?"
```

The AI reads the recent history and gives you the highlights. No more scrolling through 200 messages to find the one decision that matters.

### Search Across Everything

```
"Find messages about the API deadline"
"What did Sarah say about the launch date?"
"Search for discussions about pricing"
```

Uses Slack's search API, so it's fast and comprehensive.

### Send Updates

```
"Post the standup summary to #engineering"
"Tell #product we're deploying at 3pm"
"Update the thread about the bug fix"
```

### Get Channel Overview

```
"What channels am I in?"
"Show me my unread counts"
"Which channels have been most active today?"
```

## How It Works

### The Tools

Under the hood, these tools do the work:

| Tool | What It Does |
|------|--------------|
| `getSlackChannelsTool` | Lists channels with unread counts |
| `getSlackChannelHistoryTool` | Reads recent messages from a channel |
| `searchSlackTool` | Searches messages across workspace |
| `sendSlackMessageTool` | Posts messages to channels/threads |
| `updateSlackMessageTool` | Edits existing messages |
| `getSlackUserInfoTool` | Looks up user details |

### Which Agents Have Access

All of them:
- **Zoe** - Your personal AI companion
- **Paddy** - The project manager agent  
- **Custom Assistants** - Any assistant you create

They all share the same Slack connection and capabilities.

### Security Notes

- **Your token is server-side only** - Never exposed to the AI context
- **Scoped to your workspace** - Can't access other workspaces
- **Read-only by default** - Sending requires explicit user request
- **No credential leakage** - See our [security post](/blog/ai-agent-security-lessons-from-clawdbot) for how we prevent prompt injection from exfiltrating tokens

## Slash Commands (Optional)

If you want direct Slack commands, you can set up slash commands that hit your Mastra API:

| Command | What It Does |
|---------|--------------|
| `/paddy <question>` | Chat with Paddy |
| `/expo create <task>` | Create an action |
| `/expo list` | Show your tasks |

This requires additional setup (Event Subscriptions, Request URL verification). The AI-chat-based approach works without any of that.

## Meeting Notifications

When paired with [Fireflies](/docs/features/fireflies), meeting summaries automatically post to configured channels:

```
📋 Meeting Summary: Weekly Standup

Key Points:
• API integration on track for Thursday
• Design review moved to Friday
• Need decision on pricing tier names

Action Items:
• Review staging deployment (High) → @james
• Prepare client demo (Medium) → @sarah

[View in Exponential]
```

### Configure Per-Project

1. Open project settings
2. Under **Notifications**, pick a Slack channel
3. Meeting summaries for that project auto-route there

## Troubleshooting

### "I can't see any messages"

Check your bot token scopes. The `*:history` scopes are required to read messages. Slack's permissions are annoyingly granular.

### "Search returns nothing"

The `search:read` scope is separate from history scopes. You need both.

### "Bot can't post to a channel"

The bot needs to be invited to private channels. For public channels, `chat:write.public` lets it post without being a member.

### "User mapping is wrong"

Exponential maps Slack users to accounts by email. If someone's Slack email differs from their Exponential email, it won't match. Team admins can set up manual mappings in Settings.

## The Real Talk

Slack is overwhelming by design. It's a firehose that makes you feel productive while actually fragmenting your attention across 47 channels.

This integration doesn't fix that. What it does:
- Lets you catch up without the scroll
- Surfaces what actually matters
- Keeps Slack as a reference instead of a live obligation

Your AI reads Slack so you can read less of it. That's the goal.

---

*Something not working? Reach out: support@exponential.im*
