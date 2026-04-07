---
title: Notifications
description: Stay informed with push notifications, email alerts, and customizable notification preferences
---

## Overview

Exponential keeps you informed about what matters through multiple notification channels. You can receive push notifications on your devices, email alerts, and scheduled summaries — all configurable to match your preferences.

### Notification Types

| Notification | What triggers it | Channels |
|-------------|-----------------|----------|
| **Task assignment** | Someone assigns you a task | Push, Email |
| **Comment mention** | Someone @mentions you in a comment | Push, Email |
| **Daily plan reminder** | Every morning | Push |
| **Task due reminder** | Before a task is due (configurable) | Push |
| **Daily summary** | At your chosen time each day | Push |
| **Weekly summary** | On your chosen day each week | Push |

## Push Notifications

Push notifications appear on your device in real time — even when you're not using Exponential.

### Enabling Push Notifications

1. Go to **Settings > Notifications**
2. Click **Enable Notifications**
3. When your browser prompts, click **Allow**
4. You'll see a success message confirming notifications are active

Once enabled, you can click **Test** to send yourself a test notification and verify everything is working.

### Supported Devices

Push notifications work on:
- **Desktop**: Chrome, Firefox, Edge, Safari (macOS Ventura+)
- **Mobile**: Android (via Chrome or installed PWA), iOS (via installed PWA on iOS 16.4+)

For the best mobile experience, install Exponential as a PWA (Progressive Web App) from your browser's "Add to Home Screen" option.

### Disabling Push Notifications

1. Go to **Settings > Notifications**
2. Click **Disable** next to your active subscription

This removes the subscription for the current device only. If you've enabled notifications on multiple devices, you'll need to disable each one separately.

### Troubleshooting

**"Notifications blocked" message**
Your browser has denied notification permissions. To fix this:
- **Chrome**: Click the lock icon in the address bar > Site settings > Notifications > Allow
- **Firefox**: Click the lock icon > Permissions > Notifications > Allow
- **Safari**: Safari > Settings > Websites > Notifications > Allow

**"Notification setup unavailable"**
The notification service couldn't be reached. Try refreshing the page. If it persists, the service may be temporarily unavailable.

**"Subscription failed"**
Your browser couldn't create a push subscription. Try refreshing the page or clearing your browser cache.

**Not receiving notifications on mobile**
Make sure you've installed Exponential as a PWA from your browser. Regular mobile browser tabs may not receive push notifications reliably.

## Email Notifications

Email notifications are sent for collaborative events like task assignments and comment mentions.

### What triggers an email

- **Task assignment** — When someone assigns you to a task, you'll receive an email with the task name, who assigned it, and a direct link
- **Comment mention** — When someone @mentions you in a comment, you'll receive an email with a preview of the comment and a link to the task

### Controlling email notifications

Email notifications can be controlled at two levels:

**Per-workspace override** (takes priority):
1. Go to **Settings > Notifications**
2. Find the workspace under **Email Notifications**
3. Choose **On**, **Off**, or **Default**

**Workspace default**:
Each workspace has a default email notification setting. When your preference is set to **Default**, you'll follow whatever the workspace owner has configured.

## Notification Preferences

### Global Settings

Your notification preferences control what you receive and when. Access them from **Settings > Notifications**.

| Setting | What it controls |
|---------|-----------------|
| **Task reminders** | Get notified before tasks are due |
| **Daily summary** | Morning overview of your tasks for the day |
| **Weekly summary** | Weekly recap of completed and pending work |
| **Timezone** | Ensures notifications arrive at the right local time |
| **Quiet hours** | Suppress notifications during specific hours (e.g., 10 PM - 7 AM) |

### Task Reminder Timing

You can choose how far in advance you want to be reminded about upcoming tasks:

| Option | Use case |
|--------|----------|
| **5 minutes** | Last-minute heads up |
| **15 minutes** | Quick preparation time |
| **30 minutes** | Standard reminder |
| **1 hour** | Planning buffer |
| **2 hours** | Extended preparation |
| **1 day** | Advance planning |
| **2 days** | Early warning |

You can select multiple intervals — for example, get a reminder 1 day before *and* 15 minutes before a task is due.

### Daily Summary

The daily summary tells you:
- How many tasks you have today
- How many are completed vs. pending
- Any overdue tasks
- Your top 3 priority tasks

Configure when you receive it by setting your preferred **summary time** (e.g., 9:00 AM) and **timezone**.

### Weekly Summary

The weekly summary gives you a high-level view of:
- Total tasks and completion rate
- Active projects
- Week-over-week progress

Choose which **day of the week** you'd like to receive it.
