---
title: Slack
description: Let Zoe read, search and post in your Slack, and route meeting summaries to channels
section: integrations
order: 2
icon: IconBrandSlack
---

Connect a Slack workspace and Zoe can catch you up on channels, search history, post updates and tell you where the noise is, so you read less Slack. Projects can also route their meeting summaries and action items into a channel.

## Where to find it

[Settings → Integrations](/settings/integrations) → **Add Integration** → **Slack**. The connection is yours; Zoe uses it in every workspace you are in.

## How to connect Slack

You need a Slack app for your Slack workspace first.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create an app **from scratch** in your Slack workspace.
2. Under **OAuth & Permissions**, add these bot scopes:

   | Scope | Why |
   |---|---|
   | `channels:history`, `groups:history` | Read public and private channel messages |
   | `channels:read`, `groups:read` | List channels |
   | `im:history`, `im:read` | Read and list DMs (optional) |
   | `chat:write` | Post messages |
   | `users:read` | Look up who said what |
   | `search:read` | Search message history |

3. Click **Install to Workspace** and approve. Copy the **Bot User OAuth Token** (starts with `xoxb-`) and, from **Basic Information**, the **Signing Secret**.
4. In Exponential, open [Settings → Integrations](/settings/integrations), click **Add Integration**, choose **Slack**, and paste the **Bot Token** and **Signing Secret**. **Team ID** is optional; it is detected from the token.
5. Invite the bot to any private channel you want Zoe to see.

## How to use it

Ask [Zoe](/docs/zoe/assistant) in the drawer, on the Agents page, or from WhatsApp:

- "What happened in #engineering today?"
- "Find messages about the API deadline."
- "Post the standup summary to #product."
- "Which channels have been most active today?"

Reading is always allowed once connected; posting only happens when you ask for it in that message.

## How to send meeting summaries to a channel

When a meeting is assigned to a project that has a Slack channel configured, the summary and extracted action items post to that channel with links back to Exponential. Configure the channel in the project's settings. See [Fireflies](/docs/meet/fireflies) for how meetings arrive.

## How it connects

- **Zoe** — every Slack ability is a tool Zoe uses; see [Zoe](/docs/zoe/assistant).
- **Meetings** — summaries come from [Fireflies](/docs/meet/fireflies) meetings assigned to a project.
- **Notifications** — your own reminders and digests are delivered by [Notifications](/docs/collaborate/notifications), which is separate from this integration.

## FAQ

**Zoe cannot see any messages.**
Check the `*:history` scopes on the Slack app, then reinstall it to Slack so the new scopes take effect.

**Search returns nothing.**
`search:read` is a separate scope from the history scopes; add it and reinstall.

**The bot cannot post to a channel.**
Invite it to the channel. For public channels, adding `chat:write.public` lets it post without joining.

**People are attributed wrongly.**
Exponential matches Slack users to accounts by email. If a teammate's Slack email differs from their Exponential email, the match fails.

**Is my token safe?**
The token is stored encrypted and used server-side only; it is never placed in the AI's context. Read the [security post](/blog/ai-agent-security-lessons-from-clawdbot) on how prompt injection is kept away from credentials.
