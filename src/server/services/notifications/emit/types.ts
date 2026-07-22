import type { PrismaClient } from "@prisma/client";
import { type NOTIFICATION_CATEGORIES } from "./constants";
import type { NotificationCategory } from "./constants";

/**
 * Per-category subject payloads. Each carries exactly what its recipient
 * resolver and content builder need. New categories add a variant here and a
 * matching arm to the {@link EmitNotificationInput} union.
 */

/** Assignment (V1): the action and the users just assigned to it. */
export interface AssignmentSubject {
  actionId: string;
  assignedUserIds: string[];
}

/**
 * Discriminated union pairing each category with its subject. `emitNotification`
 * narrows on `category`, so recipient resolvers and content builders get a
 * fully-typed subject with no casts.
 */
export type EmitNotificationInput = {
  db: PrismaClient;
  /** The user who performed the action — never notified about their own action. */
  actorUserId: string | null;
  /** When null/absent → immediate best-effort send. Future date → cron fires it. */
  scheduledFor?: Date | null;
} & {
  category: typeof NOTIFICATION_CATEGORIES.ASSIGNMENT;
  subject: AssignmentSubject;
};

/**
 * The rendered, channel-agnostic body of one notification for one recipient.
 * Channels adapt this to their wire format (push payload, email template, chat
 * message). `deeplink` is a workspace-relative path.
 */
export interface NotificationContent {
  category: NotificationCategory;
  title: string;
  message: string;
  /** Workspace-relative deep link, e.g. `/w/acme/actions/abc123`. */
  deeplink?: string;
  metadata?: Record<string, unknown>;
  /** Workspace the notification belongs to — drives the email override + matrix. */
  workspaceId: string;
  /** Stable per (event, recipient) — the dedup key on the Notification row. */
  dedupeKey: string;
}
