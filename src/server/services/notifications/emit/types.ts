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
 * Mention (V2): a comment on some target (action / feature / scope), already
 * resolved to its workspace + display name + deep-link. Recipients are parsed
 * from the `@[Name](id)` markup and membership-filtered by the resolver.
 */
export interface MentionSubject {
  /** Comment id — stabilises the dedup key per (comment, recipient). */
  commentId: string;
  commentContent: string;
  /** Pre-edit body: users already mentioned in it are skipped (no re-spam on edit). */
  previousContent?: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  /** Display name of the thing the comment is on (action name, feature name). */
  targetName: string;
  /** Workspace-relative deep link to the comment thread. */
  targetPath: string;
}

/**
 * Due-date reminder (V3): a specific owned action, a single reminder offset, and
 * the owner it fires for. The cron computes the (action, offset, owner) tuple
 * and its crossing; emit just delivers to that owner.
 */
export interface DueDateSubject {
  actionId: string;
  actionName: string;
  ownerUserId: string;
  /** Which reminderMinutesBefore offset this reminder is for (part of the dedup key). */
  offsetMinutes: number;
  dueDate: Date;
  workspaceId: string;
  workspaceSlug: string;
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
} & (
  | {
      category: typeof NOTIFICATION_CATEGORIES.ASSIGNMENT;
      subject: AssignmentSubject;
    }
  | {
      category: typeof NOTIFICATION_CATEGORIES.MENTION;
      subject: MentionSubject;
    }
  | {
      category: typeof NOTIFICATION_CATEGORIES.DUE_DATE;
      subject: DueDateSubject;
    }
);

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
