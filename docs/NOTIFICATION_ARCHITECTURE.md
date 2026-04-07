# Notification System Architecture

The notification system delivers messages across multiple channels (email, push, WhatsApp) with user-configurable preferences and workspace-level overrides.

## Notification Events

| Event | Trigger | Email | Push | WhatsApp | Preference Gate |
|-------|---------|-------|------|----------|-----------------|
| **Task assignment** | User assigned to action | Yes | Yes | - | `shouldSendEmailNotification()` |
| **Comment mention** | @mentioned in comment | Yes | Yes | - | `shouldSendEmailNotification()` |
| **Daily plan reminder** | Cron (morning) | - | Yes | - | Has push subscription |
| **Task due reminder** | Scheduled (configurable) | - | Yes | Yes | `NotificationPreference.taskReminders` |
| **Daily summary** | Scheduled (configurable time) | - | Yes | Yes | `NotificationPreference.dailySummary` |
| **Weekly summary** | Scheduled (configurable day) | - | Yes | Yes | `NotificationPreference.weeklySummary` |
| **Transcription complete** | Fireflies webhook | - | Yes | Yes | Scheduled notification |

## Preference Resolution

The `shouldSendEmailNotification()` function in `EmailNotificationService.ts` determines whether to notify a user for a given workspace. Both email and push notifications use this same gate for event-triggered notifications (assignments, mentions).

```
1. User has no email           → don't notify
2. NotificationPreference.enabled = false → don't notify
3. WorkspaceNotificationOverride exists   → use that value
4. Fallback → Workspace.enableEmailNotifications (default: true)
```

For scheduled notifications (reminders, summaries), preferences are checked at scheduling time — only users with the relevant preference enabled get a `ScheduledNotification` created. Delivery then goes to all available channels (push + WhatsApp).

## File Map

### Core Services (`src/server/services/notifications/`)

| File | Purpose |
|------|---------|
| `EmailNotificationService.ts` | Event-triggered notifications (assignments, mentions). Sends email + push. Contains `shouldSendEmailNotification()` preference resolution. |
| `NotificationScheduler.ts` | Singleton that processes scheduled notifications every 60s. Delivers via push + WhatsApp. Schedules recurring daily/weekly summaries and task reminders. |
| `WebPushService.ts` | `sendPushNotification()` for single device, `sendPushToUser()` for all user devices. Auto-cleans expired subscriptions (410 Gone). |
| `NotificationTemplates.ts` | Message templates for daily summary, weekly summary, and task reminders. |
| `hooks.ts` | Task lifecycle hooks: `onTaskChange()`, `onTaskComplete()`, `onTaskDelete()`. Manages reminder scheduling/cancellation. |
| `init.ts` | Starts the NotificationScheduler on server boot. |
| `WhatsAppNotificationService.ts` | WhatsApp message delivery. |
| `SlackNotificationService.ts` | Slack channel notifications. |
| `NotificationServiceFactory.ts` | Factory for creating channel-specific notification services. |
| `FeedbackDigestService.ts` | Compiles daily/weekly feedback digests. |

### API Routers (`src/server/api/routers/`)

| File | Purpose |
|------|---------|
| `notification.ts` | CRUD for `NotificationPreference`, `WorkspaceNotificationOverride`, `ScheduledNotification`. Stats and test notification endpoints. |
| `pushSubscription.ts` | Push subscription management: subscribe, unsubscribe, list, sendTest, getVapidPublicKey. |

### Cron Jobs (`src/app/api/cron/`)

| File | Purpose |
|------|---------|
| `daily-plan-reminder/route.ts` | Morning push notification with today's action count. Protected by `CRON_SECRET`. |

### Client-Side (`src/hooks/`, `src/app/_components/`)

| File | Purpose |
|------|---------|
| `usePushNotifications.ts` | Hook for push subscription lifecycle. Converts VAPID key to Uint8Array, manages permission state. |
| `PushNotificationToggle.tsx` | Enable/disable push with specific error messages per failure mode. |
| `ServiceWorkerRegistration.tsx` | Registers `/sw.js` on mount. |
| `NotificationPreferences.tsx` | Modal for managing all notification settings (timezone, reminder timing, quiet hours). |
| `NotificationDashboard.tsx` | Stats and scheduled notification list with filtering. |

### Service Worker

| File | Purpose |
|------|---------|
| `public/sw.js` | Handles `push` events (shows notification) and `notificationclick` events (navigates to URL). |

## Database Models

### NotificationPreference
Per-user global notification settings.
- `enabled` — master switch
- `taskReminders` / `dailySummary` / `weeklySummary` — per-type toggles
- `timezone` — for scheduling (default: UTC)
- `dailySummaryTime` / `weeklyDayOfWeek` — when to send summaries
- `reminderMinutesBefore` — array of intervals (e.g., `[15, 60, 1440]`)
- `quietHoursEnabled` / `quietHoursStart` / `quietHoursEnd` — do-not-disturb window

### WorkspaceNotificationOverride
Per-user, per-workspace override for email notifications.
- `emailNotifications` — overrides the workspace default for this user

### ScheduledNotification
Queue for scheduled notifications (reminders, summaries).
- `type` — `task_reminder`, `daily_summary`, `weekly_summary`, `project_update`, `transcription_completed`
- `status` — `pending`, `processing`, `sent`, `failed`, `cancelled`
- `scheduledFor` — when to deliver
- `attempts` / `lastError` — retry tracking (max 3 attempts)

### PushSubscription
Web Push API subscriptions per user.
- `endpoint` / `p256dh` / `auth` — Web Push protocol fields
- Indexed by `userId` for multi-device support

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | For push | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | For push | Web Push VAPID private key |
| `AUTH_POSTMARK_KEY` or `POSTMARK_SERVER_TOKEN` | For email | Postmark API key |
| `AUTH_POSTMARK_FROM` | For email | Sender address (default: `noreply@exponential.im`) |
| `CRON_SECRET` | For cron | Protects cron endpoints from unauthorized access |

## Adding a New Notification Trigger

1. **Identify the event** — where in the code does the event happen? (router, webhook, service)

2. **For event-triggered notifications** (like assignments/mentions):
   ```typescript
   import { sendPushToUser } from "~/server/services/notifications/WebPushService";

   // Check preferences first
   const shouldSend = await shouldSendEmailNotification(db, recipientId, workspaceId);
   if (!shouldSend) return;

   // Send push
   void sendPushToUser(recipientId, {
     title: "Notification title",
     body: "Notification body",
     tag: "event-type",
     url: "/path/to/relevant/page",
   }, db);

   // Send email (if recipient has email)
   if (recipientEmail) {
     await sendSomeEmail({ ... });
   }
   ```

3. **For scheduled notifications** (like reminders):
   - Create a `ScheduledNotification` record with the appropriate type and `scheduledFor` time
   - The `NotificationScheduler` will pick it up and deliver via push + WhatsApp automatically

4. **For task lifecycle events**:
   - Use the hooks in `hooks.ts` (`onTaskChange`, `onTaskComplete`, `onTaskDelete`)
   - These automatically manage reminder scheduling and cancellation
