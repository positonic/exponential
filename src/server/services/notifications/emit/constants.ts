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

/** All categories, in preference-matrix row order. */
export const CATEGORY_LIST = [
  NOTIFICATION_CATEGORIES.ASSIGNMENT,
  NOTIFICATION_CATEGORIES.MENTION,
  NOTIFICATION_CATEGORIES.DUE_DATE,
  NOTIFICATION_CATEGORIES.SUMMARY,
  NOTIFICATION_CATEGORIES.MEETING_READY,
] as const;

/** All channels, in stable delivery / matrix-column order. */
export const CHANNEL_LIST = [
  NOTIFICATION_CHANNELS.PUSH,
  NOTIFICATION_CHANNELS.EMAIL,
  NOTIFICATION_CHANNELS.MATRIX,
  NOTIFICATION_CHANNELS.WHATSAPP,
  NOTIFICATION_CHANNELS.ZULIP,
] as const;

/**
 * Seeded fallback for the category × channel matrix — used when a user has no
 * explicit {@link NotificationChannelPreference} row for a cell. Always-on
 * channels (Push, Email) default on for high-signal categories; Summary keeps
 * push quiet. Opt-in channels (Matrix, WhatsApp, Zulip) default off everywhere,
 * so connecting a chat channel never auto-starts pings (CONTEXT: Notification
 * channel).
 */
export const DEFAULT_MATRIX: Record<
  NotificationCategory,
  Record<NotificationChannel, boolean>
> = {
  [NOTIFICATION_CATEGORIES.ASSIGNMENT]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.MENTION]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.DUE_DATE]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.SUMMARY]: { push: false, email: true, matrix: false, whatsapp: false, zulip: false },
  [NOTIFICATION_CATEGORIES.MEETING_READY]: { push: true, email: true, matrix: false, whatsapp: false, zulip: false },
};
