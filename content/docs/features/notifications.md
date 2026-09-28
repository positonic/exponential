---
title: Notifications
description: Choose which notifications you get and where they go — push, email, Matrix, WhatsApp, or Zulip
section: features
order: 29
icon: IconBell
---

## Overview

Exponential can notify you by **push**, **email**, **Matrix**, **WhatsApp**, and **Zulip**. Push and email work out of the box. The chat channels are opt-in: connect one, then pick which notifications it receives.

Everything is configured on one page: [Settings → Notifications](/settings/notifications).

### Notification types

| Notification | What triggers it | Default channels |
|-------------|-----------------|------------------|
| **Assignments** | Someone assigns you an action | Push, Email |
| **Mentions** | Someone @mentions you in a comment on a ticket, feature, action, or insight | Push, Email |
| **Due-date reminders** | 15 minutes, 1 hour, and 1 day before an action you own is due | Push, Email |
| **Summaries** | Your daily and weekly digests, at the time you choose | Email |
| **Meeting-ready** | A meeting's notes and summary are ready | Push, Email |
| **Added to a meeting** | Someone adds you as a meeting participant | Push, Email |
| **Agenda ready** | A ceremony's agenda has been generated | Push, Email |
| **Daily plan reminder** | Every morning, with your task count for the day | Push only |

You never get notified about your own actions, and mentions only reach members of the workspace the comment is in.

## Choosing where each notification goes

The **Delivery preferences** section of [Settings → Notifications](/settings/notifications) shows one card per channel you can use. Inside each card, tick the notification types you want on that channel.

- **Push** and **Email** cards are always shown.
- **Matrix**, **WhatsApp**, and **Zulip** cards appear only after you connect that channel (see below). They start with everything unticked, so connecting a chat channel never starts pinging you until you ask it to.

Changes save immediately.

## Push notifications

Push notifications appear on your device in real time, even when Exponential isn't open.

### Enabling push

1. Open [Settings → Notifications](/settings/notifications).
2. Under **Push Notifications**, click **Enable Notifications**.
3. When your browser prompts, click **Allow**.

Click **Test** to send yourself a test notification.

### Supported devices

- **Desktop**: Chrome, Firefox, Edge, Safari (macOS Ventura+)
- **Mobile**: Android (Chrome or installed PWA), iOS 16.4+ (installed PWA only)

For mobile, install Exponential as a PWA using your browser's **Add to Home Screen** option. Regular mobile browser tabs may not receive push reliably.

### Disabling push

Click **Disable** next to your active subscription. This only affects the current device. Disable each device separately if you enabled push on several.

### Troubleshooting push

**"Notifications blocked"** — your browser denied permission. Re-allow it:
- **Chrome**: lock icon in the address bar → Site settings → Notifications → Allow
- **Firefox**: lock icon → Permissions → Notifications → Allow
- **Safari**: Safari → Settings → Websites → Notifications → Allow

**"Notification setup unavailable"** — the push service couldn't be reached. Refresh and try again.

**"Subscription failed"** — refresh the page or clear your browser cache, then retry.

## Email notifications

Email is on by default for every notification type except the daily plan reminder. Untick types you don't want under the **Email** card in Delivery preferences.

### Turning email off for one workspace

You can also switch email off for a whole workspace without touching your other preferences:

1. Open [Settings → Notifications](/settings/notifications).
2. Scroll to **Email Notifications** and find the workspace.
3. Choose **On**, **Off**, or **Default**.

**Default** follows the setting the workspace owner has chosen. A workspace set to **Off** here suppresses email for it even if the Email card has the type ticked.

## Matrix notifications

Get notifications as a direct message from the Zoe bot in any Matrix client (Element, etc.). Setup takes about a minute.

### 1. Pair your Matrix account

1. Open [Settings → Assistant](/settings/assistant). If you haven't set up your assistant yet, give it a name and personality and click **Create Assistant** first — the Matrix card needs it.
2. In the **Matrix** card, enter your full Matrix ID (for example `@you:syntro.fi`) and click **Connect Matrix**.
3. The bot invites you to a chat. Accept the invite in your Matrix client and send the pairing code shown in the app into that chat. The code expires after 10 minutes.

The card shows **Connected** once pairing succeeds.

### 2. Choose what Matrix receives

1. Open [Settings → Notifications](/settings/notifications).
2. A **Matrix (Zoe DM)** card now appears under Delivery preferences. Tick the types you want, such as **Mentions**.
3. Click **Send test** on the card to confirm a message arrives in your Zoe DM.

You keep getting emails too unless you untick them under the Email card.

### Troubleshooting Matrix

**No Matrix card in Delivery preferences** — you haven't paired yet, or pairing didn't finish. Check [Settings → Assistant](/settings/assistant) shows **Connected**.

**Send test fails with "no paired Matrix DM"** — the bot lost your chat room, usually because you left it. Click **Disconnect Matrix** in Settings → Assistant and pair again.

**Mentions don't arrive** — only mentions made with the @ picker (or `--mention` in the CLI) notify anyone. A plain `@name` typed as text does nothing. Also confirm you're a member of the workspace the comment is in. Mentions in **page** comments are currently email and push only and do not reach Matrix.

## Zulip and WhatsApp

These work the same way as Matrix: once your account is linked, the channel's card appears under Delivery preferences with every type unticked.

- **Zulip**: a workspace admin links your Exponential account to your Zulip user under the workspace's **Settings → Integrations → Zulip**.
- **WhatsApp**: not self-serve yet. The card appears only if your phone number has already been linked to a workspace's WhatsApp integration.

## Summaries

The **Summary schedule** card on [Settings → Notifications](/settings/notifications) controls when digests go out. Which channels receive them is the **Summaries** tick in Delivery preferences.

- **Daily summary** — tasks due today, what's completed vs. pending, overdue items, and your top priorities. Pick the send time.
- **Weekly summary** — completion rate, active projects, and week-over-week progress. Pick the weekday; it goes out at the same time as the daily summary.

Times use the timezone on your [profile](/settings/profile). If you haven't set one, times are read as UTC and the card offers to use your browser's timezone.

## Due-date reminders

Reminders fire 15 minutes, 1 hour, and 1 day before an action is due. They go to the action's owner: its assignees, or its creator if nobody is assigned. Actions that are already completed or cancelled never trigger a reminder.

Choose which channels receive them with the **Due-date reminders** tick in Delivery preferences.
