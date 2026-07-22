/**
 * Canonical vocabulary for the unified notification pipeline (ADR-0045).
 *
 * Categories are the *rows* of the preference matrix (the kind of thing that
 * happened); channels are the *columns* (where it can be delivered). Both are
 * stored as plain strings on the Notification / NotificationDelivery /
 * NotificationChannelPreference tables — these consts give us type-safety and a
 * single place to enumerate them without a Prisma enum migration.
 */

export const NOTIFICATION_CATEGORIES = {
  ASSIGNMENT: "assignment",
  MENTION: "mention",
  DUE_DATE: "due_date",
  SUMMARY: "summary",
  MEETING_READY: "meeting_ready",
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export const NOTIFICATION_CHANNELS = {
  PUSH: "push",
  EMAIL: "email",
  MATRIX: "matrix",
  WHATSAPP: "whatsapp",
  ZULIP: "zulip",
} as const;

export type NotificationChannel =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

/** Always-on channels — every user has them; seeded on for high-signal categories. */
export const ALWAYS_ON_CHANNELS: readonly NotificationChannel[] = [
  NOTIFICATION_CHANNELS.PUSH,
  NOTIFICATION_CHANNELS.EMAIL,
];

/** Opt-in channels — must be connected; default off for every category. */
export const OPT_IN_CHANNELS: readonly NotificationChannel[] = [
  NOTIFICATION_CHANNELS.MATRIX,
  NOTIFICATION_CHANNELS.WHATSAPP,
  NOTIFICATION_CHANNELS.ZULIP,
];

/** Delivery lifecycle for a single (notification, channel) row. */
export const DELIVERY_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
} as const;

export type DeliveryStatus =
  (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];
