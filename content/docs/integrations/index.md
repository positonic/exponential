---
title: Integrations
description: Where every connection lives, what each one does, and which page to set it up on
section: integrations
order: 1
icon: IconPlug
sidebarTitle: Overview
updated: 2026-09-29
---

Exponential connects to the tools your work already flows through: meeting recorders send transcripts in, chat apps let you talk to Zoe, and task tools stay in sync. Connections are personal (they live under your account, not the workspace) unless a page says otherwise.

![Settings → Integrations](/doc-assets/integrations.png)

## Where to find it

- [Settings → Integrations](/settings/integrations) — connect accounts and services. This is the main page.
- [Workflows](/workflows), from your user menu — a status board for the data-capture and task-sync integrations, plus two guided processes.
- [Workspace settings → **Integrations**](/go/settings) — connections that belong to the workspace rather than to you: the agents' email account, Postmark, Slack and Zulip notification routing, a Matrix homeserver, Sentry, the default Notion account and Fireflies. See [Workspace settings](/docs/reference/workspace-settings).

## What you can connect

| Service | What it does | Set up on |
|---|---|---|
| [Fireflies](/docs/meet/fireflies) | Sends every recorded meeting in, with actions and a summary extracted | Settings → Integrations → **Add Fireflies** |
| [Slack](/docs/integrations/slack) | Lets Zoe read, search and post in your Slack; routes meeting summaries to channels | Settings → Integrations → **Add Integration** → Slack |
| [Chat gateways](/docs/zoe/chat-gateways) | Chat with Zoe from WhatsApp | Settings → Integrations → **Connect WhatsApp** |
| [Telegram](/docs/zoe/chat-gateways) | Chat with Zoe from Telegram, with a default agent per connection | Settings → Integrations → **Connect Telegram** |
| [Notion](/docs/integrations/notion) | Two-way sync between a Notion database and your actions, with status mapping | Workflows → **Notion Tasks Database** → Configure |
| [Monday.com](/docs/integrations/github-google-monday) | Sync actions with a Monday.com board (push, pull or both) | Workflows → **Monday.com Boards** → Configure |
| Calendar feeds | Subscribe to a published calendar by its ICS address (works with Outlook); events refresh every 15 minutes and appear on Today | Settings → Integrations → **Add calendar feed** |
| [Google Calendar](/docs/integrations/github-google-monday) | Two-way calendar access; in early access while Google verification completes | Settings → Integrations → **Request Access** |
| [GitHub](/docs/integrations/github-google-monday) | Track repositories so pull requests and commits show in activity and metrics; needs the GitHub App installed by an administrator | Settings → Integrations → **GitHub Repositories** |
| Email (IMAP) | Read a mailbox for the CRM | Settings → Integrations → **Add Integration** → Email (IMAP) |
| [iOS shortcut](/docs/capture/ios-shortcut), [Chrome extension](/docs/capture/chrome-extension) | Capture actions from your phone or browser using an API key | [Settings → API keys](/settings/api-keys) |

Notion and Monday.com sync are exclusive: pick one task system to sync with, to avoid duplicate actions.

## How to add a service

1. Open [Settings → Integrations](/settings/integrations).
2. Scroll to **External Service Integrations** and click **Add Integration**.
3. Choose the service and enter what it asks for (an API key, or a bot token and signing secret). Credentials are encrypted at rest.
4. The service appears under **Connected Services**. Some services then need a step on their side, for example Fireflies' webhook; each guide covers it.

## How to read the Workflows page

Each card on [Workflows](/workflows) shows a status:

| Status | Meaning |
|---|---|
| **Active** | Connected and working |
| **Available** | Ready to set up |
| **Setup Required** | Partly configured; open it to finish |
| **Available Soon** / **Coming Soon** | Not available yet |

Below the integrations are two **Guided Processes**: **Launch Sprint** (a three-week plan to validate or launch a product) and **Elevator Pitch** (a structured pitch template).

## How it connects

- **Meetings** — Fireflies is the main way meetings arrive; the Meetings page (Amplify → Meetings) lists them and lets you assign each to a project.
- **Zoe** — Slack, WhatsApp and Telegram are all ways of reaching [Zoe](/docs/zoe/assistant); she has the same memory and tools in each.
- **API tokens** — services that need to call Exponential (webhooks, the shortcut, the extension) use a key from [API tokens](/docs/developers/api-tokens). Integrations that Exponential calls out to use *their* credentials, stored here.
- **Notifications** — where summaries and reminders are delivered is a separate setting: [Notifications](/docs/collaborate/notifications).

## FAQ

**Is a connection shared with my team?**
No. Connections under Settings → Integrations are yours. Workspace-level settings (Notion default account, GitHub repositories) are under workspace settings → Integrations and visible to admins.

**Something shows "Setup Required".**
Open the card. Usually a token expired or a second step (such as pasting a webhook into the other service) was never completed.

**Can I sync with both Notion and Monday.com?**
No, one task system at a time.
